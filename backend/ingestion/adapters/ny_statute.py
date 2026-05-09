"""NyStatuteAdapter — fetches New York Vehicle & Traffic Law from nysenate.gov.

URL template:
  https://www.nysenate.gov/legislation/laws/VAT/{section}

Existence marker: div class="nys-openleg-content-container"

Sections walked:
  Article 21 (Rules of the Road): 1100–1299
  Article 30 (Speed Restrictions): 1180–1199
  Article 31 (Alcohol/Drug-Related Offenses): 1192–1199
  Article 19 (Reckless Driving etc.): 1212

Combined walk: 1100–1299 covers all of the above.

Cache files: data/raw/statutes/ny/NY_{section}.html / .invalid
"""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

_URL_TEMPLATE = "https://www.nysenate.gov/legislation/laws/VAT/{section}"
_USER_AGENT = (
    "NyStatuteIngester/1.0 (EvenUp-OpenClaw hackathon prototype; "
    "+https://example.invalid/legal-research)"
)
_DEFAULT_DELAY = 1.5  # nysenate.gov is slower; be polite
_MAX_RETRIES = 3

# Walk Article 21 + surrounding articles
NY_VAT_RANGE = (1100, 1299)


def _section_exists(html: str) -> bool:
    return "nys-openleg-content-container" in html


class NyStatuteAdapter:
    """Fetches NY Vehicle & Traffic Law sections with caching and rate-limiting."""

    def __init__(
        self,
        cache_dir: str | None = None,
        request_delay: float = _DEFAULT_DELAY,
    ) -> None:
        if cache_dir is None:
            from backend.config import DATA_DIR
            cache_dir = str(DATA_DIR / "raw" / "statutes" / "ny")
        from pathlib import Path
        self._cache_dir = Path(cache_dir)
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._request_delay = request_delay
        self._last_request_at: float = 0.0
        self._client = httpx.Client(
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            timeout=30.0,
        )

    def section_url(self, section: str) -> str:
        return _URL_TEMPLATE.format(section=section)

    def fetch_section_html(self, section: str) -> str | None:
        """Return HTML for a NY VAT section, or None if it doesn't exist.

        Cache:
          NY_{section}.html    — valid section
          NY_{section}.invalid — non-existent section marker
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
        return self._cache_dir / f"NY_{safe}.html"

    def _invalid_path(self, section: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", section)
        return self._cache_dir / f"NY_{safe}.invalid"

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
