"""Web adapter — uses Claude's `web_search_20250305` server tool to find related
public documents, and `httpx` to fetch the matched URLs.

Why Claude's web_search tool: zero extra setup beyond `ANTHROPIC_API_KEY`, results
already include URL + title + page snippet, and Anthropic handles rate-limiting and
robots compliance on their side. Pricing is $10/1k searches — fine at hackathon scale.
"""

from __future__ import annotations

import hashlib
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import anthropic
import httpx

from backend.config import RAW_DIR, Settings
from backend.ingestion.adapters.base import RawDocument, SearchResult


_WEB_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
}


class WebAdapter:
    """Search uses Claude's web_search tool (needs ANTHROPIC_API_KEY); fetch uses
    httpx (no key needed). The Anthropic client is lazy so URL-direct ingestion
    works without a key configured."""

    def __init__(self, settings: Settings, client: anthropic.Anthropic | None = None) -> None:
        self._settings = settings
        self._client = client
        self._http = httpx.Client(
            timeout=settings.fetch_timeout_seconds,
            follow_redirects=True,
            headers={"User-Agent": settings.fetch_user_agent},
        )

    def _ensure_client(self) -> anthropic.Anthropic:
        if self._client is not None:
            return self._client
        if not self._settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for web search.")
        self._client = anthropic.Anthropic(api_key=self._settings.anthropic_api_key)
        return self._client

    # ------------------------------------------------------------------ search

    def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        """Ask Claude to web-search for the query, then pull URLs out of the
        `web_search_tool_result` content blocks. We don't read Claude's prose
        reply — we just want the structured search hits."""

        client = self._ensure_client()
        tool = {
            **_WEB_SEARCH_TOOL,
            "max_uses": min(self._settings.web_search_max_uses, 5),
        }
        response = client.messages.create(
            model=self._settings.web_search_model,
            max_tokens=2048,
            tools=[tool],
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Search the public web for documents related to: {query}\n\n"
                        "Prefer primary sources (court decisions, government pages, "
                        "official records) over commentary. Run one or two targeted "
                        "searches; you do not need to write a summary."
                    ),
                }
            ],
        )

        results: list[SearchResult] = []
        seen_urls: set[str] = set()

        for block in response.content:
            block_type = getattr(block, "type", None)
            if block_type != "web_search_tool_result":
                continue
            content = getattr(block, "content", None) or []
            for item in content:
                url = getattr(item, "url", None)
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                results.append(
                    SearchResult(
                        url=url,
                        title=getattr(item, "title", None),
                        snippet=_first_text(getattr(item, "encrypted_content", None))
                        or getattr(item, "page_age", None),
                        source_type="web",
                        metadata={
                            k: v
                            for k, v in {
                                "page_age": getattr(item, "page_age", None),
                            }.items()
                            if v is not None
                        },
                    )
                )
                if len(results) >= max_results:
                    return results
        return results

    # ------------------------------------------------------------------- fetch

    def fetch(self, result: SearchResult) -> RawDocument:
        """Fetch the URL and persist raw bytes to disk under data/raw/web/."""

        time.sleep(0.5)  # token bit of politeness; we never burst-fetch in this slice

        response = self._http.get(result.url)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "").split(";")[0].strip() or None
        raw_path = _persist_raw(result.url, response.content)
        text = _maybe_text(response, content_type)

        return RawDocument(
            url=result.url,
            title=result.title,
            source_type=result.source_type,
            content_type=content_type,
            raw_path=str(raw_path),
            text=text,
            snippet=result.snippet,
        )

    def close(self) -> None:
        self._http.close()


# --------------------------------------------------------------------- helpers


def _first_text(value: object) -> str | None:
    """The web_search tool sometimes returns a list of blocks with `.text`. Be lenient."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        for entry in value:
            text = getattr(entry, "text", None)
            if text:
                return text
    return None


def _maybe_text(response: httpx.Response, content_type: str | None) -> str | None:
    """Only decode text-ish responses inline. PDFs/binaries stay on disk for later."""
    if not content_type:
        return None
    if content_type.startswith(("text/", "application/json", "application/xml", "application/xhtml")):
        try:
            return response.text
        except Exception:
            return None
    return None


def _persist_raw(url: str, body: bytes) -> Path:
    parsed = urlparse(url)
    host = re.sub(r"[^A-Za-z0-9._-]", "_", parsed.netloc) or "unknown"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
    out_dir = RAW_DIR / "web" / host
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{digest}.bin"
    out_path.write_bytes(body)
    return out_path
