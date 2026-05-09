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
from backend.models import Document, Statute, StatuteFactor


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
    from backend.retrieval import normalize_subdivision
    from backend.extraction.factors import is_known_factor

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
        if html is None:
            failures.append(f"fetch {base}: section not found at leginfo")
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
            # Store subdivision in canonical bare-letter form ("a", "a-b") so
            # downstream code (embeddings, API responses) doesn't have to deal
            # with "(a)" vs "a" ambiguity. None for bare sections.
            subdiv = normalize_subdivision(subdivision_of(sec_num_full)) or None

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

            factor_value = (row.get("Contributing Factor") or "").strip()
            factor_quote = row["Statute Language"].strip()[:240] or None
            factor_known = bool(factor_value) and is_known_factor(factor_value)
            if factor_value and not factor_known:
                failures.append(
                    f"unknown factor {factor_value!r} on § {sec_num_full} — tag dropped"
                )

            try:
                with get_session() as session:
                    existing = session.scalar(
                        select(Statute).where(Statute.statute_id == statute_id)
                    )
                    if existing:
                        rows_skipped += 1
                    else:
                        session.add(statute)
                        session.flush()
                        rows_persisted += 1

                    if factor_known:
                        already_tagged = session.scalar(
                            select(StatuteFactor).where(
                                StatuteFactor.statute_id == statute_id,
                                StatuteFactor.factor == factor_value,
                            )
                        )
                        if not already_tagged:
                            session.add(
                                StatuteFactor(
                                    statute_id=statute_id,
                                    factor=factor_value,
                                    confidence=1.0,
                                    quote=factor_quote,
                                )
                            )
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


# ---------------------------------------------------------------------------
# Division walk — ingest every section in a numeric range
# ---------------------------------------------------------------------------

# Ranges to walk for a full CA VEH ingest:
#   Division 11   — Rules of the Road      [21000 – 23336]
#   Division 11.5 — DUI Sentencing         [23500 – 23675]
_CA_VEH_DIVISIONS: list[tuple[int, int]] = [
    (21000, 23336),
    (23500, 23675),
]


@dataclass
class DivisionWalkReport:
    sections_attempted: int
    sections_found: int
    sections_persisted: int
    sections_skipped: int   # already in DB
    sections_missing: int   # no content at leginfo
    failures: list[str] = field(default_factory=list)


def ingest_ca_vehicle_code_divisions(
    divisions: list[tuple[int, int]] | None = None,
    settings: Settings | None = None,
    cache_dir: str | None = None,
) -> DivisionWalkReport:
    """Walk integer section numbers across CA VEH divisions and persist each found section.

    For each integer N in the given ranges:
      1. Check the in-memory set of already-persisted statute_ids (fast skip).
      2. Fetch HTML from leginfo (or disk cache / .invalid marker).
      3. If the section exists, parse and persist a Statute row.

    Covers ~1,500 sections across Division 11 + 11.5. The first run takes
    ~40 minutes at 1 req/sec; subsequent runs are near-instant from cache.
    Sections already ingested via the CSV path are skipped cleanly.
    """
    from backend.ingestion.adapters.ca_statute import CaStatuteAdapter, make_statute_id
    from backend.parsing.html_parse import parse_leginfo_section

    if divisions is None:
        divisions = _CA_VEH_DIVISIONS

    settings = settings or load_settings()
    adapter = CaStatuteAdapter(cache_dir=cache_dir) if cache_dir else CaStatuteAdapter()

    # Load all existing statute_ids once to avoid per-section DB round-trips
    with get_session() as session:
        existing_ids: set[str] = set(session.scalars(select(Statute.statute_id)).all())

    attempted = 0
    found = 0
    persisted = 0
    skipped = 0
    missing = 0
    failures: list[str] = []

    for start, end in divisions:
        for n in range(start, end + 1):
            sec_str = str(n)
            attempted += 1
            statute_id = make_statute_id("CA", "VEH", sec_str)

            if statute_id in existing_ids:
                skipped += 1
                continue

            url = adapter.section_url(sec_str)
            try:
                html = adapter.fetch_section_html(sec_str)
            except Exception as exc:
                failures.append(f"fetch § {sec_str}: {exc}")
                continue

            if html is None:
                missing += 1
                continue

            found += 1

            try:
                parsed = parse_leginfo_section(html, url)
            except Exception as exc:
                failures.append(f"parse § {sec_str}: {exc}")
                continue

            if not parsed.get("statute_text"):
                missing += 1
                found -= 1
                continue

            statute = Statute(
                statute_id=statute_id,
                jurisdiction="CA",
                code_name="VEH",
                section_number=sec_str,
                universal_citation=f"Cal. Veh. Code § {sec_str}",
                subdivision=None,
                division=parsed.get("division"),
                chapter=parsed.get("chapter"),
                statute_text=parsed.get("statute_text"),
                complete_statute=parsed.get("statute_text"),
                official_url=url,
                retrieved_at=datetime.now(timezone.utc),
            )

            try:
                with get_session() as session:
                    session.add(statute)
                existing_ids.add(statute_id)
                persisted += 1
            except IntegrityError:
                skipped += 1
            except Exception as exc:
                failures.append(f"persist § {sec_str}: {exc}")

    adapter.close()

    return DivisionWalkReport(
        sections_attempted=attempted,
        sections_found=found,
        sections_persisted=persisted,
        sections_skipped=skipped,
        sections_missing=missing,
        failures=failures,
    )


# ---------------------------------------------------------------------------
# Generic multi-state walk
# ---------------------------------------------------------------------------

def ingest_state_statutes(
    jurisdiction: str,
    code_name: str,
    universal_citation_fmt: str,
    adapter,
    section_keys: list[str],
    parse_fn,
) -> DivisionWalkReport:
    """Generic walk over an arbitrary list of section keys.

    Args:
        jurisdiction:           e.g. "FL", "NY", "WA"
        code_name:              e.g. "STAT", "VAT", "RCW"
        universal_citation_fmt: e.g. "Fla. Stat. § {section}"
        adapter:                FlStatuteAdapter / NyStatuteAdapter / WaStatuteAdapter
        section_keys:           list of strings to pass to adapter.fetch_section_html()
        parse_fn:               parse_fl_section / parse_ny_section / parse_wa_section

    Returns DivisionWalkReport with the same counters used by the CA walk.
    """
    from backend.retrieval import make_statute_id

    with get_session() as session:
        existing_ids: set[str] = set(session.scalars(select(Statute.statute_id)).all())

    attempted = 0
    found = 0
    persisted = 0
    skipped = 0
    missing = 0
    failures: list[str] = []

    for sec_key in section_keys:
        attempted += 1
        statute_id = make_statute_id(jurisdiction, code_name, sec_key)

        if statute_id in existing_ids:
            skipped += 1
            continue

        url = adapter.section_url(sec_key)
        try:
            html = adapter.fetch_section_html(sec_key)
        except Exception as exc:
            failures.append(f"fetch {sec_key}: {exc}")
            continue

        if html is None:
            missing += 1
            continue

        found += 1

        try:
            parsed = parse_fn(html, url)
        except Exception as exc:
            failures.append(f"parse {sec_key}: {exc}")
            continue

        if not parsed.get("statute_text"):
            missing += 1
            found -= 1
            continue

        # Use the section_number returned by the parser when available
        section_number = parsed.get("section_number") or sec_key

        statute = Statute(
            statute_id=statute_id,
            jurisdiction=jurisdiction,
            code_name=code_name,
            section_number=section_number,
            universal_citation=universal_citation_fmt.format(section=sec_key),
            subdivision=None,
            division=parsed.get("division"),
            chapter=parsed.get("chapter"),
            statute_text=parsed.get("statute_text"),
            complete_statute=parsed.get("statute_text"),
            official_url=url,
            retrieved_at=datetime.now(timezone.utc),
        )

        try:
            with get_session() as session:
                session.add(statute)
            existing_ids.add(statute_id)
            persisted += 1
        except IntegrityError:
            skipped += 1
        except Exception as exc:
            failures.append(f"persist {sec_key}: {exc}")

    return DivisionWalkReport(
        sections_attempted=attempted,
        sections_found=found,
        sections_persisted=persisted,
        sections_skipped=skipped,
        sections_missing=missing,
        failures=failures,
    )


def ingest_fl_statutes(cache_dir: str | None = None) -> DivisionWalkReport:
    """Ingest Florida Statutes Chapter 316 (State Uniform Traffic Control)."""
    from backend.ingestion.adapters.fl_statute import FlStatuteAdapter, FL_CHAPTER_316_RANGE
    from backend.parsing.html_parse import parse_fl_section

    adapter = FlStatuteAdapter(cache_dir=cache_dir)
    start, end = FL_CHAPTER_316_RANGE
    section_keys = [f"316.{i:03d}" for i in range(start, end + 1)]

    report = ingest_state_statutes(
        jurisdiction="FL",
        code_name="STAT",
        universal_citation_fmt="Fla. Stat. § {section}",
        adapter=adapter,
        section_keys=section_keys,
        parse_fn=parse_fl_section,
    )
    adapter.close()
    return report


def ingest_ny_statutes(cache_dir: str | None = None) -> DivisionWalkReport:
    """Ingest New York Vehicle & Traffic Law Articles 21 + 30 (sections 1100–1299)."""
    from backend.ingestion.adapters.ny_statute import NyStatuteAdapter, NY_VAT_RANGE
    from backend.parsing.html_parse import parse_ny_section

    adapter = NyStatuteAdapter(cache_dir=cache_dir)
    start, end = NY_VAT_RANGE
    section_keys = [str(i) for i in range(start, end + 1)]

    report = ingest_state_statutes(
        jurisdiction="NY",
        code_name="VAT",
        universal_citation_fmt="N.Y. Veh. & Traf. Law § {section}",
        adapter=adapter,
        section_keys=section_keys,
        parse_fn=parse_ny_section,
    )
    adapter.close()
    return report


def ingest_wa_statutes(cache_dir: str | None = None) -> DivisionWalkReport:
    """Ingest Washington RCW Chapter 46.61 (Rules of the Road)."""
    from backend.ingestion.adapters.wa_statute import WaStatuteAdapter, WA_RCW_46_61_RANGE
    from backend.parsing.html_parse import parse_wa_section

    adapter = WaStatuteAdapter(cache_dir=cache_dir)
    start, end = WA_RCW_46_61_RANGE
    section_keys = [f"{i:03d}" for i in range(start, end + 1)]

    report = ingest_state_statutes(
        jurisdiction="WA",
        code_name="RCW",
        universal_citation_fmt="RCW 46.61.{section}",
        adapter=adapter,
        section_keys=section_keys,
        parse_fn=parse_wa_section,
    )
    adapter.close()
    return report
