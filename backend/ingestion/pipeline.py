"""Phase 2 ingestion pipeline. For now: search the web → fetch each hit → persist.

Parsing, chunking, extraction, and indexing live in later phases. They'll plug into
this same orchestrator without changing its signature."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

from sqlalchemy import select

from backend.config import Settings, load_settings
from backend.db import get_session
from backend.ingestion.adapters.base import RawDocument, SearchResult
from backend.ingestion.adapters.web import WebAdapter
from backend.models import Document


log = logging.getLogger(__name__)


@dataclass
class IngestionReport:
    query: str
    found: int
    fetched: int
    persisted: int
    skipped_existing: int
    failures: list[str]
    documents: list[dict]


def ingest_search(query: str, max_results: int = 5, settings: Settings | None = None) -> IngestionReport:
    """Run one search → fetch → persist cycle for `query`. Idempotent on URL."""

    settings = settings or load_settings()
    adapter = WebAdapter(settings=settings)
    failures: list[str] = []
    fetched = 0
    persisted = 0
    skipped_existing = 0
    persisted_docs: list[dict] = []

    try:
        results = adapter.search(query=query, max_results=max_results)
    except Exception as exc:  # network / API errors bubble out as a clean report failure
        adapter.close()
        log.exception("web search failed for query=%r", query)
        return IngestionReport(
            query=query,
            found=0,
            fetched=0,
            persisted=0,
            skipped_existing=0,
            failures=[f"search: {exc!s}"],
            documents=[],
        )

    found = len(results)

    try:
        for hit in results:
            with get_session() as session:
                existing = session.scalar(select(Document).where(Document.url == hit.url))
                if existing:
                    skipped_existing += 1
                    persisted_docs.append(_doc_to_dict(existing))
                    continue

            try:
                raw = adapter.fetch(hit)
            except Exception as exc:
                failures.append(f"fetch {hit.url}: {exc!s}")
                continue
            fetched += 1

            doc = _save_document(hit, raw)
            persisted += 1
            persisted_docs.append(doc)
    finally:
        adapter.close()

    return IngestionReport(
        query=query,
        found=found,
        fetched=fetched,
        persisted=persisted,
        skipped_existing=skipped_existing,
        failures=failures,
        documents=persisted_docs,
    )


def _save_document(hit: SearchResult, raw: RawDocument) -> dict:
    document_id = _document_id(hit.url)
    with get_session() as session:
        doc = Document(
            document_id=document_id,
            title=raw.title,
            url=raw.url,
            source_type=raw.source_type,
            content_type=raw.content_type,
            raw_path=raw.raw_path,
            text=raw.text,
            snippet=raw.snippet,
            retrieved_at=raw.retrieved_at,
        )
        session.add(doc)
        session.flush()
        return _doc_to_dict(doc)


def _document_id(url: str) -> str:
    return "doc_" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def _doc_to_dict(doc: Document) -> dict:
    return {
        "document_id": doc.document_id,
        "title": doc.title,
        "url": doc.url,
        "source_type": doc.source_type,
        "content_type": doc.content_type,
        "snippet": doc.snippet,
        "raw_path": doc.raw_path,
        "retrieved_at": doc.retrieved_at.isoformat() if doc.retrieved_at else None,
    }
