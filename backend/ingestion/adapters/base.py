"""Abstract base for source adapters and the small dataclasses they exchange."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol


@dataclass
class SearchResult:
    """One hit from a web/source search. Lightweight — no raw bytes yet."""

    url: str
    title: str | None = None
    snippet: str | None = None
    source_type: str = "web"
    metadata: dict = field(default_factory=dict)


@dataclass
class RawDocument:
    """A fetched document. Raw bytes are kept on disk; `raw_path` points to them."""

    url: str
    title: str | None
    source_type: str
    content_type: str | None
    raw_path: str
    text: str | None
    snippet: str | None
    retrieved_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class SourceAdapter(Protocol):
    """All ingestion adapters expose `search` (find URLs) and `fetch` (pull a URL)."""

    def search(self, query: str, max_results: int = 5) -> list[SearchResult]: ...

    def fetch(self, result: SearchResult) -> RawDocument: ...
