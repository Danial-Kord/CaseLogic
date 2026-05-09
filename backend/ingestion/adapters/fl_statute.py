"""FlStatuteAdapter — fetches Florida Statutes Chapter 316 from leg.state.fl.us.

URL template:
  https://www.leg.state.fl.us/Statutes/index.cfm
  ?App_mode=Display_Statute&URL=0300-0399/0316/Sections/0316.{frac}.html

where {frac} is the fractional part of the section number (e.g. 183 for 316.183).

Polite scraping: ~1 req/sec, exponential backoff on 429/5xx, disk cache.
Cache files: data/raw/statutes/fl/FL_{section}.html / .invalid
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from backend.ingestion.adapters.base import RawDocument, SearchResult

log = logging.getLogger(__name__)

_BASE_URL = (
    "https://www.leg.state.fl.us/Statutes/index.cfm"
    "?App_mode=Display_Statute&URL=0300-0399/0316/Sections/0316.{frac}.html"
)
_USER_AGENT = (
    "FlStatuteIngester/1.0 (EvenUp-OpenClaw hackathon prototype; "
    "+https://example.invalid/legal-research)"
)
_DEFAULT_DELAY = 1.1
_MAX_RETRIES = 3

# Walk all of Chapter 316 (State Uniform Traffic Control)
# 316.001 – 316.650; integer suffix range 1–650
FL_CHAPTER_316_RANGE = (1, 650)


def _section_exists(html: str) -> bool:
    return "SectionBody" in html


class FlStatuteAdapter:
    """Fetches Florida Statutes Chapter 316 sections with caching and rate-limiting."""

    def __init__(
        self,
        cache_dir: str | Path | None = None,
        request_delay: float = _DEFAULT_DELAY,
    ) -> None:
        if cache_dir is None:
            from backend.config import DATA_DIR
            cache_dir = DATA_DIR / "raw" / "statutes" / "fl"
        self._cache_dir = Path(cache_dir)
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._request_delay = request_delay
        self._last_request_at: float = 0.0
        self._client = httpx.Client(
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            timeout=25.0,
        )

    def section_url(self, section: str) -> str:
        """Build URL for section like '316.183'."""
        frac = section.split(".", 1)[-1] if "." in section else section
        return _BASE_URL.format(frac=frac)

    def fetch_section_html(self, section: str) -> str | None:
        """Return HTML for section '316.183', or None if it doesn't exist.

        Cache:
          FL_{section}.html    — valid section
          FL_{section}.invalid — non-existent section marker
        """
        cache = self._cache_path(section)
        if cache.exists():
            log.debug("cache hit: %s", cache.name)
            return cache.read_text(encoding="utf-8")

        invalid = self._invalid_path(section)
        if invalid.exists():
            log.debug("known missing: § %s", section)
            return None

        url = self.section_url(section)
        log.info("fetching %s", url)
        html = self._fetch_with_retry(url)

        if not _section_exists(html):
            log.debug("§ %s — no section content", section)
            invalid.write_text("", encoding="utf-8")
            return None

        cache.write_text(html, encoding="utf-8")
        return html

    def _cache_path(self, section: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", section)
        return self._cache_dir / f"FL_{safe}.html"

    def _invalid_path(self, section: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", section)
        return self._cache_dir / f"FL_{safe}.invalid"

    def _fetch_with_retry(self, url: str) -> str:
        backoff = 2.0
        for attempt in range(_MAX_RETRIES):
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < self._request_delay:
                time.sleep(self._request_delay - elapsed)
            try:
                resp = self._client.get(url)
                self._last_request_at = time.monotonic()
                if resp.status_code == 200:
                    return resp.text
                if resp.status_code == 429 or resp.status_code >= 500:
                    log.warning(
                        "HTTP %s for %s (attempt %d/%d); backing off %.0fs",
                        resp.status_code, url, attempt + 1, _MAX_RETRIES, backoff,
                    )
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                resp.raise_for_status()
            except httpx.TimeoutException:
                log.warning("timeout on attempt %d for %s", attempt + 1, url)
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(backoff)
                    backoff *= 2
        raise RuntimeError(f"failed to fetch {url} after {_MAX_RETRIES} attempts")

    def close(self) -> None:
        self._client.close()
