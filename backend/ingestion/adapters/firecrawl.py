"""Firecrawl adapter — uses the Firecrawl API to search and scrape web pages into
clean markdown. Implements the same SourceAdapter protocol as WebAdapter so it can
be swapped in anywhere WebAdapter is used.

Requires: FIRECRAWL_API_KEY in environment. Install: pip install firecrawl-py
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from urllib.parse import urlparse

from backend.config import RAW_DIR, Settings
from backend.ingestion.adapters.base import RawDocument, SearchResult


class FirecrawlAdapter:
    """search() uses Firecrawl's /search endpoint; fetch() uses /scrape.
    Both return clean markdown — no HTML parsing needed downstream."""

    def __init__(self, settings: Settings) -> None:
        if not settings.firecrawl_api_key:
            raise RuntimeError("FIRECRAWL_API_KEY is required for FirecrawlAdapter.")
        from firecrawl import FirecrawlApp  # lazy import — not installed in all envs
        self._app = FirecrawlApp(api_key=settings.firecrawl_api_key)

    # ------------------------------------------------------------------ search

    def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        """Search via Firecrawl and return lightweight SearchResult objects.
        Firecrawl /search already scrapes each hit, so markdown is available
        immediately, but we don't store it here — fetch() handles persistence."""

        raw = self._app.search(query, limit=max_results)
        results: list[SearchResult] = []

        # SDK returns SearchData with .web list of SearchResultWeb Pydantic objects
        if isinstance(raw, list):
            items = raw
        else:
            items = getattr(raw, "web", None) or []

        for item in items[:max_results]:
            if isinstance(item, dict):
                url = item.get("url") or item.get("sourceURL") or ""
                title = item.get("title")
                snippet = item.get("description") or _truncate(item.get("markdown"), 300)
                score = item.get("score")
            else:
                url = getattr(item, "url", "") or ""
                title = getattr(item, "title", None)
                snippet = getattr(item, "description", None)
                score = getattr(item, "score", None)
            if not url:
                continue
            results.append(
                SearchResult(
                    url=url,
                    title=title,
                    snippet=snippet,
                    source_type="web",
                    metadata={k: v for k, v in {"score": score}.items() if v is not None},
                )
            )
        return results

    # ------------------------------------------------------------------- fetch

    def fetch(self, result: SearchResult) -> RawDocument:
        """Scrape a URL via Firecrawl and persist the raw markdown to disk."""

        scraped = self._app.scrape_url(result.url, formats=["markdown"])

        if isinstance(scraped, dict):
            data = scraped
        else:
            data = scraped.__dict__ if hasattr(scraped, "__dict__") else {}

        markdown = data.get("markdown") or ""
        metadata = data.get("metadata") or {}
        title = result.title or metadata.get("title") or metadata.get("ogTitle")
        content_type = "text/markdown"

        raw_path = _persist_raw(result.url, markdown.encode("utf-8"))

        return RawDocument(
            url=result.url,
            title=title,
            source_type="web",
            content_type=content_type,
            raw_path=str(raw_path),
            text=markdown or None,
            snippet=result.snippet,
        )


# --------------------------------------------------------------------- helpers

def _truncate(text: str | None, length: int) -> str | None:
    if not text:
        return None
    return text[:length] + "…" if len(text) > length else text


def _persist_raw(url: str, body: bytes) -> Path:
    parsed = urlparse(url)
    host = re.sub(r"[^A-Za-z0-9._-]", "_", parsed.netloc) or "unknown"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
    out_dir = RAW_DIR / "web" / host
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{digest}.md"
    out_path.write_bytes(body)
    return out_path
