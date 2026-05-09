"""WaStatuteAdapter — fetches Washington RCW Title 46 from app.leg.wa.gov.

URL template:
  https://app.leg.wa.gov/rcw/default.aspx?cite=46.61.{section_num}

Existence marker: div class="section-page"

Section numbers are three-digit suffixes: 46.61.001 – 46.61.990
We walk the full range; .invalid markers skip missing ones instantly on re-runs.

Cache files: data/raw/statutes/wa/WA_{section}.html / .invalid
"""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

_URL_TEMPLATE = "https://app.leg.wa.gov/rcw/default.aspx?cite=46.61.{section_num}"
_USER_AGENT = (
    "WaStatuteIngester/1.0 (EvenUp-OpenClaw hackathon prototype; "
    "+https://example.invalid/legal-research)"
)
_DEFAULT_DELAY = 1.1
_MAX_RETRIES = 3

# Walk RCW 46.61 (Rules of the Road): suffix 001–990
WA_RCW_46_61_RANGE = (1, 990)


def _section_exists(html: str) -> bool:
    return "section-page" in html


class WaStatuteAdapter:
    """Fetches Washington RCW 46.61 sections with caching and rate-limiting."""

    def __init__(
        self,
        cache_dir: str | None = None,
        request_delay: float = _DEFAULT_DELAY,
    ) -> None:
        if cache_dir is None:
            from backend.config import DATA_DIR
            cache_dir = str(DATA_DIR / "raw" / "statutes" / "wa")
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
        """section is e.g. '46.61.500' or just '500' — always returns full URL."""
        # Accept either "500" or "46.61.500"
        num = section.split(".")[-1] if "." in section else section
        num_padded = f"{int(num):03d}"
        return _URL_TEMPLATE.format(section_num=num_padded)

    def fetch_section_html(self, section: str) -> str | None:
        """Return HTML for a WA RCW section, or None if it doesn't exist.

        Cache:
          WA_{section}.html    — valid section
          WA_{section}.invalid — non-existent section marker
        """
        cache = self._cache_path(section)
        if cache.exists():
            log.debug("cache hit: %s", cache.name)
            return cache.read_text(encoding="utf-8")

        invalid = self._invalid_path(section)
        if invalid.exists():
            log.debug("known missing: § 46.61.%s", section)
            return None

        url = self.section_url(section)
        log.info("fetching %s", url)
        html = self._fetch_with_retry(url)

        if not _section_exists(html):
            log.debug("§ 46.61.%s — no section content", section)
            invalid.write_text("", encoding="utf-8")
            return None

        cache.write_text(html, encoding="utf-8")
        return html

    def _cache_path(self, section: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", section)
        return self._cache_dir / f"WA_{safe}.html"

    def _invalid_path(self, section: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", section)
        return self._cache_dir / f"WA_{safe}.invalid"

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
