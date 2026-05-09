"""POST /ingest/search and POST /ingest/url route handlers."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.ingestion.adapters.base import SearchResult
from backend.ingestion.pipeline import IngestionReport, ingest_search
from backend.ingestion.adapters.web import WebAdapter
from backend.config import load_settings


router = APIRouter(prefix="/ingest", tags=["ingest"])


class SearchIngestRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=512)
    max_results: int = Field(5, ge=1, le=10)


class UrlIngestRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    title: str | None = None


class IngestResponse(BaseModel):
    query: str
    found: int
    fetched: int
    persisted: int
    skipped_existing: int
    failures: list[str]
    documents: list[dict]


def _report_to_response(report: IngestionReport) -> IngestResponse:
    return IngestResponse(
        query=report.query,
        found=report.found,
        fetched=report.fetched,
        persisted=report.persisted,
        skipped_existing=report.skipped_existing,
        failures=report.failures,
        documents=report.documents,
    )


@router.post("/search", response_model=IngestResponse)
def ingest_search_endpoint(payload: SearchIngestRequest) -> IngestResponse:
    """Search the web for `query`, fetch each hit, persist raw documents to SQLite."""
    try:
        report = ingest_search(query=payload.query, max_results=payload.max_results)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _report_to_response(report)


@router.post("/url", response_model=IngestResponse)
def ingest_url_endpoint(payload: UrlIngestRequest) -> IngestResponse:
    """Direct-URL ingestion: skip search, just fetch + persist."""
    settings = load_settings()
    try:
        adapter = WebAdapter(settings=settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        result = SearchResult(url=payload.url, title=payload.title, source_type="web")
        try:
            raw = adapter.fetch(result)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"fetch failed: {exc!s}")

        # Reuse pipeline persistence so the dedup + persist logic stays in one place.
        from backend.ingestion.pipeline import _document_id, _doc_to_dict
        from backend.db import get_session
        from backend.models import Document
        from sqlalchemy import select

        with get_session() as session:
            existing = session.scalar(select(Document).where(Document.url == payload.url))
            if existing:
                return IngestResponse(
                    query=payload.url,
                    found=1,
                    fetched=0,
                    persisted=0,
                    skipped_existing=1,
                    failures=[],
                    documents=[_doc_to_dict(existing)],
                )
            doc = Document(
                document_id=_document_id(payload.url),
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
            return IngestResponse(
                query=payload.url,
                found=1,
                fetched=1,
                persisted=1,
                skipped_existing=0,
                failures=[],
                documents=[_doc_to_dict(doc)],
            )
    finally:
        adapter.close()
