"""Ingestion pipeline.

Two ingest paths:
  1. ingest_search()          — web search → fetch → persist to Document table (Phase 2)
  2. ingest_ca_vehicle_code() — CSV → fetch leginfo → parse → persist to Statute table (Phase 1)

Parsing, chunking, extraction, and indexing live in later phases and will plug
into these same orchestrators without changing their signatures.
"""

from __future__ import annotations

import csv
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.config import Settings, load_settings
from backend.db import get_session
from backend.ingestion.adapters.base import RawDocument, SearchResult
from backend.models import Document, Statute


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
    from backend.ingestion.adapters.web import WebAdapter  # lazy: needs anthropic

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


# ---------------------------------------------------------------------------
# Phase 1 — California Vehicle Code ingestion
# ---------------------------------------------------------------------------

@dataclass
class StatuteIngestionReport:
    rows_requested: int
    rows_fetched: int
    rows_parsed: int
    rows_persisted: int
    rows_skipped: int
    failures: list[str] = field(default_factory=list)


def ingest_ca_vehicle_code(
    csv_path: str,
    settings: Settings | None = None,
    cache_dir: str | None = None,
) -> StatuteIngestionReport:
    """Read the eval CSV, fetch each CA VEH section from leginfo, and persist to Statute.

    Each unique base section (e.g., 21453) is fetched once from leginfo and cached
    to data/raw/ca_statutes/.  The CSV has one row per citable subdivision, so a
    single fetch can produce multiple Statute rows (e.g., 21453(a), 21453(a)-(b),
    21453(c) each become their own row).

    Returns a StatuteIngestionReport with counts and a list of failure strings.
    """
    from backend.ingestion.adapters.ca_statute import CaStatuteAdapter, base_section, subdivision_of, make_statute_id
    from backend.parsing.html_parse import parse_leginfo_section

    settings = settings or load_settings()
    adapter = CaStatuteAdapter(cache_dir=cache_dir) if cache_dir else CaStatuteAdapter()

    # Read all CSV rows up-front
    rows = _read_csv_rows(csv_path)
    rows_requested = len(rows)

    # Group rows by base section so we fetch each section's HTML exactly once
    from collections import defaultdict
    by_base: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_base[base_section(row["Section #"])].append(row)

    rows_fetched = 0
    rows_parsed = 0
    rows_persisted = 0
    rows_skipped = 0
    failures: list[str] = []

    for base, section_rows in by_base.items():
        url = adapter.section_url(base)
        try:
            html = adapter.fetch_section_html(base)
        except Exception as exc:
            failures.append(f"fetch {base}: {exc}")
            continue
        rows_fetched += 1

        try:
            parsed = parse_leginfo_section(html, url)
        except Exception as exc:
            failures.append(f"parse {base}: {exc}")
            continue
        rows_parsed += 1

        for row in section_rows:
            sec_num_full = row["Section #"].strip()
            statute_id = make_statute_id("CA", "VEH", sec_num_full)
            subdiv = subdivision_of(sec_num_full)

            statute = Statute(
                statute_id=statute_id,
                jurisdiction="CA",
                code_name="VEH",
                section_number=base_section(sec_num_full),
                universal_citation=row["Statute"].strip(),
                subdivision=subdiv,
                division=parsed.get("division"),
                chapter=parsed.get("chapter"),
                statute_text=row["Statute Language"].strip(),
                complete_statute=row["Complete Statute"].strip(),
                official_url=url,
                retrieved_at=datetime.now(timezone.utc),
            )

            try:
                with get_session() as session:
                    existing = session.scalar(
                        select(Statute).where(Statute.statute_id == statute_id)
                    )
                    if existing:
                        rows_skipped += 1
                        continue
                    session.add(statute)
                rows_persisted += 1
            except IntegrityError:
                rows_skipped += 1
            except Exception as exc:
                failures.append(f"persist {sec_num_full}: {exc}")

    adapter.close()

    return StatuteIngestionReport(
        rows_requested=rows_requested,
        rows_fetched=rows_fetched,
        rows_parsed=rows_parsed,
        rows_persisted=rows_persisted,
        rows_skipped=rows_skipped,
        failures=failures,
    )


def _read_csv_rows(csv_path: str) -> list[dict]:
    """Return all non-header rows from the eval CSV as plain dicts."""
    with open(csv_path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))
