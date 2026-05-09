"""CaStatuteAdapter — fetches California statute sections from leginfo.

URL template:
  https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml
  ?lawCode={code}&sectionNum={base_section}

Polite scraping rules:
  - Real User-Agent string
  - ~1 request/second (configurable)
  - Exponential back-off on HTTP 429 or 5xx (max 3 attempts)
  - Raw HTML cached to data/raw/ca_statutes/VEH_{section}.html
"""

from __future__ import annotations

import csv
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from backend.ingestion.adapters.base import RawDocument, SearchResult

log = logging.getLogger(__name__)

_LEGINFO_TEMPLATE = (
    "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml"
    "?lawCode={code}&sectionNum={section}"
)
_USER_AGENT = (
    "CaStatuteIngester/1.0 (EvenUp-OpenClaw hackathon prototype; "
    "+https://example.invalid/legal-research)"
)
_DEFAULT_DELAY = 1.1   # slightly over 1 req/sec to be safe
_MAX_RETRIES = 3


def base_section(section_num: str) -> str:
    """Return the numeric section number, stripping subdivision notation.

    Examples:
        '21453(a)-(b)' -> '21453'
        '2800.1(a)'    -> '2800.1'
        '22350'        -> '22350'
        '22100.5'      -> '22100.5'
    """
    m = re.match(r"^(\d[\d.]*)", section_num)
    return m.group(1) if m else section_num


def subdivision_of(section_num: str) -> str:
    """Return subdivision notation after the base section number, or '' if none.

    Examples:
        '21453(a)-(b)' -> '(a)-(b)'
        '22350'        -> ''
    """
    base = base_section(section_num)
    return section_num[len(base):]


def make_statute_id(jurisdiction: str, code: str, section_num: str) -> str:
    """Build a stable, URL-safe identifier slug.

    Examples:
        ('CA', 'VEH', '21453(a)-(b)') -> 'ca-veh-21453-a-b'
        ('CA', 'VEH', '2800.1(a)')    -> 'ca-veh-2800-1-a'
        ('CA', 'VEH', '22350')        -> 'ca-veh-22350'
    """
    sanitized = re.sub(r"[^a-zA-Z0-9]+", "-", section_num).lower().strip("-")
    return f"{jurisdiction.lower()}-{code.lower()}-{sanitized}"


class CaStatuteAdapter:
    """Fetches California statute sections with caching and polite rate-limiting.

    Implements the SourceAdapter protocol: search() → fetch().

    search() returns one SearchResult per *unique base section* found in the CSV.
    fetch() pulls one URL, writes HTML to disk, and returns a RawDocument.
    """

    def __init__(
        self,
        cache_dir: str | Path | None = None,
        law_code: str = "VEH",
        request_delay: float = _DEFAULT_DELAY,
    ) -> None:
        if cache_dir is None:
            from backend.config import DATA_DIR
            cache_dir = DATA_DIR / "raw" / "ca_statutes"
        self._cache_dir = Path(cache_dir)
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._law_code = law_code
        self._request_delay = request_delay
        self._last_request_at: float = 0.0
        self._client = httpx.Client(
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            timeout=25.0,
        )

    # ------------------------------------------------------------------
    # SourceAdapter protocol
    # ------------------------------------------------------------------

    def search(self, query: str, max_results: int = 200) -> list[SearchResult]:
        """Return one SearchResult per unique base section from the eval CSV.

        `query` is accepted for protocol compatibility but ignored — the eval
        CSV already pins which sections to ingest.
        """
        from backend.config import REPO_ROOT
        csv_path = REPO_ROOT / "eval-ca-vehicle-code.csv"
        return _search_results_from_csv(str(csv_path), self._law_code, max_results)

    def fetch(self, result: SearchResult) -> RawDocument:
        """Fetch one section URL. Writes raw HTML to the cache dir."""
        url = result.url
        m = re.search(r"sectionNum=([^&]+)", url)
        base = m.group(1) if m else url
        html = self.fetch_section_html(base)
        if html is None:
            raise ValueError(f"§ {base} not found at leginfo (no section content in response)")
        cache_path = self._cache_path(base)
        return RawDocument(
            url=url,
            title=result.title or f"Cal. {self._law_code} § {base}",
            source_type="statute",
            content_type="text/html",
            raw_path=str(cache_path),
            text=html,
            snippet=None,
            retrieved_at=datetime.now(timezone.utc),
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def section_url(self, base: str) -> str:
        return _LEGINFO_TEMPLATE.format(code=self._law_code, section=base)

    def fetch_section_html(self, base: str) -> str | None:
        """Return HTML for a section, or None if it doesn't exist at leginfo.

        On-disk caching:
          • VEH_{base}.html    — valid section (served on every subsequent call)
          • VEH_{base}.invalid — empty marker for non-existent sections (skips HTTP)
        """
        cache = self._cache_path(base)
        if cache.exists():
            log.debug("cache hit: %s", cache.name)
            return cache.read_text(encoding="utf-8")

        invalid_marker = self._invalid_path(base)
        if invalid_marker.exists():
            log.debug("known missing: § %s", base)
            return None

        url = self.section_url(base)
        log.info("fetching %s", url)
        html = self._fetch_with_retry(url)

        if not _section_exists(html):
            log.debug("§ %s — no section content at leginfo", base)
            invalid_marker.write_text("", encoding="utf-8")
            return None

        cache.write_text(html, encoding="utf-8")
        return html

    def _cache_path(self, base: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
        return self._cache_dir / f"{self._law_code}_{safe}.html"

    def _invalid_path(self, base: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
        return self._cache_dir / f"{self._law_code}_{safe}.invalid"

    def _fetch_with_retry(self, url: str) -> str:
        backoff = 2.0
        for attempt in range(_MAX_RETRIES):
            # Enforce rate limit
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


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------

def _section_exists(html: str) -> bool:
    """Return True if the leginfo response contains an actual section.

    leginfo omits id="codeLawSectionNoHead" entirely when a section number
    doesn't exist in the code, so this string check is sufficient.
    """
    return 'id="codeLawSectionNoHead"' in html


# ------------------------------------------------------------------
# Internal: build SearchResult list from the eval CSV
# ------------------------------------------------------------------

def _search_results_from_csv(
    csv_path: str,
    law_code: str,
    max_results: int,
) -> list[SearchResult]:
    """Read the eval CSV and return one SearchResult per unique base section."""
    seen: set[str] = set()
    results: list[SearchResult] = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            sec = row["Section #"].strip()
            b = base_section(sec)
            if b not in seen:
                seen.add(b)
                url = _LEGINFO_TEMPLATE.format(code=law_code, section=b)
                results.append(
                    SearchResult(
                        url=url,
                        title=f"Cal. Veh. Code § {b}",
                        source_type="statute",
                    )
                )
                if len(results) >= max_results:
                    break
    return results
