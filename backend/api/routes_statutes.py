"""Phase-1 statute endpoints: lookup, search, and the factor index.

Routes:

- `GET  /statutes/{statute_id}` — exact slug lookup.
- `POST /statutes/search`       — hybrid retrieval with optional factor filter.
- `GET  /factors`               — count of statutes per locked factor.

These three endpoints + the existing `/status` are the entire Phase-1 API
surface. No `/answer`, `/verify`, `/compare` — those are Phase-2 work.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Path
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from backend.api.schemas import (
    FactorCount,
    FactorsResponse,
    JurisdictionCount,
    JurisdictionsResponse,
    RelatedStatute,
    RelatedStatutesResponse,
    StatuteHitOut,
    StatuteOut,
    StatuteSearchRequest,
    StatuteSearchResponse,
)
from backend.db import get_session
from backend.extraction.factors import FACTORS, is_known_factor
from backend.models import Statute, StatuteFactor
from backend.retrieval import StatuteHit, retrieve

router = APIRouter(tags=["statutes"])

_SLUG_RE = re.compile(r"^[a-z0-9-]+$")

# Cross-reference extraction. Mirrors the patterns the frontend uses in
# components/SourceViewer/highlightLegal.tsx so the visual chips and the
# graph nodes refer to the same set of citations.
#
# We don't try to fully parse jurisdictions out of the citation. Instead
# we collect candidate "section number" strings and look them up against
# the source statute's jurisdiction (with a small set of well-known
# cross-jurisdiction prefixes promoting to a different jurisdiction).
_RX_SECTION = re.compile(
    r"\u00a7\s*(\d[\d.]*)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)
_RX_RCW = re.compile(r"\bRCW\s+(\d+\.\d+(?:\.\d+)?)", re.IGNORECASE)
_RX_FLA = re.compile(
    r"\bFla\.?\s*Stat\.?\s*\u00a7?\s*(\d+\.\d+)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)
_RX_CAL = re.compile(
    r"\bCal\.?\s*Veh\.?\s*Code\s*\u00a7?\s*(\d+)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)
_RX_NY = re.compile(
    r"\bN\.?Y\.?\s*Veh\.?\s*&?\s*Traf\.?\s*Law\s*\u00a7?\s*(\d+)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)


def _extract_citation_candidates(
    text: str, source_jurisdiction: str
) -> dict[tuple[str, str], int]:
    """Walk `text` and return a dict mapping (jurisdiction, section_number)
    to the number of times that pair was referenced.

    The goal isn't perfect parse — we just need enough candidate keys to
    do a pinpoint DB lookup. Jurisdiction-prefixed citations win over bare
    "§ N" references; bare references default to the source's jurisdiction.

    Subdivision suffixes are deliberately dropped from the key: a reference
    to "§ 23103(a)" pulls every subdivision row of § 23103 into the graph,
    which is what a lawyer scanning the cross-references actually wants.
    """

    counts: dict[tuple[str, str], int] = {}

    def bump(juris: str, section: str) -> None:
        section = section.rstrip(".").strip()
        if not section:
            return
        key = (juris, section)
        counts[key] = counts.get(key, 0) + 1

    for m in _RX_RCW.finditer(text):
        bump("WA", m.group(1))
    for m in _RX_FLA.finditer(text):
        bump("FL", m.group(1))
    for m in _RX_CAL.finditer(text):
        bump("CA", m.group(1))
    for m in _RX_NY.finditer(text):
        bump("NY", m.group(1))

    # Bare "§ N" references default to the source statute's jurisdiction.
    # We run this LAST so explicit prefixes already counted above don't
    # get double-counted via their trailing "§ N" tail.
    seen_offsets: set[int] = set()
    for jr_re in (_RX_RCW, _RX_FLA, _RX_CAL, _RX_NY):
        for m in jr_re.finditer(text):
            seen_offsets.add(m.end())
    for m in _RX_SECTION.finditer(text):
        if m.end() in seen_offsets:
            continue
        bump(source_jurisdiction, m.group(1))

    return counts


def _make_snippet(text: str, max_len: int = 160) -> str:
    """Compact the statute text into a single line suitable for hover/preview."""
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "\u2026"


@router.get("/statutes/{statute_id}", response_model=StatuteOut)
def get_statute(
    statute_id: str = Path(..., min_length=3, max_length=128),
) -> StatuteOut:
    """Exact slug lookup. Returns 404 with a clean payload if the slug doesn't
    resolve, 400 if the slug doesn't match the canonical shape."""

    if not _SLUG_RE.fullmatch(statute_id):
        raise HTTPException(
            status_code=400,
            detail=f"invalid statute_id slug: {statute_id!r}",
        )

    with get_session() as session:
        statute = session.scalar(
            select(Statute)
            .where(Statute.statute_id == statute_id)
            .options(selectinload(Statute.factors))
        )
        if statute is None:
            raise HTTPException(status_code=404, detail="statute not found")

        return StatuteOut(
            statute_id=statute.statute_id,
            universal_citation=statute.universal_citation,
            jurisdiction=statute.jurisdiction,
            code_name=statute.code_name,
            section_number=statute.section_number,
            subdivision=statute.subdivision,
            division=statute.division,
            chapter=statute.chapter,
            statute_text=statute.statute_text,
            complete_statute=statute.complete_statute,
            official_url=statute.official_url,
            factors=sorted({f.factor for f in statute.factors}),
            retrieved_at=statute.retrieved_at,
        )


@router.get(
    "/statutes/{statute_id}/related",
    response_model=RelatedStatutesResponse,
)
def get_related_statutes(
    statute_id: str = Path(..., min_length=3, max_length=128),
) -> RelatedStatutesResponse:
    """Return statutes referenced from this statute's text.

    Implementation walks `statute_text + complete_statute` for citation
    patterns (§, RCW, jurisdiction-prefixed forms), collects candidate
    `(jurisdiction, section_number)` keys, and resolves each key against
    the `statutes` table. Self-references and unresolved candidates are
    dropped silently. Results are sorted by mention count descending so
    the most-cited neighbors render first in the visualization.
    """

    if not _SLUG_RE.fullmatch(statute_id):
        raise HTTPException(
            status_code=400,
            detail=f"invalid statute_id slug: {statute_id!r}",
        )

    with get_session() as session:
        source = session.scalar(
            select(Statute).where(Statute.statute_id == statute_id)
        )
        if source is None:
            raise HTTPException(status_code=404, detail="statute not found")

        haystack = (source.statute_text or "") + "\n" + (source.complete_statute or "")
        candidates = _extract_citation_candidates(haystack, source.jurisdiction)

        if not candidates:
            return RelatedStatutesResponse(
                source_statute_id=statute_id, related=[]
            )

        # Pull every potentially-matching row in one query rather than N
        # separate lookups. The candidate set is tiny (typically <10) so a
        # tuple IN-clause via SQLAlchemy `or_` stays well under SQLite's
        # variable cap.
        from sqlalchemy import and_, or_

        clauses = [
            and_(
                Statute.jurisdiction == juris,
                Statute.section_number == section,
            )
            for (juris, section) in candidates.keys()
        ]
        rows = session.scalars(
            select(Statute)
            .where(or_(*clauses))
            .where(Statute.statute_id != statute_id)
        ).all()

        # Bucket every matching row under its (jurisdiction, section)
        # candidate key so we can attach the mention count and dedupe in
        # one pass. Multiple subdivisions of the same section all share
        # the same mention count.
        related: list[RelatedStatute] = []
        for row in rows:
            count = candidates.get((row.jurisdiction, row.section_number), 1)
            related.append(
                RelatedStatute(
                    statute_id=row.statute_id,
                    universal_citation=row.universal_citation,
                    jurisdiction=row.jurisdiction,
                    section_number=row.section_number,
                    subdivision=row.subdivision,
                    snippet=_make_snippet(row.statute_text),
                    mention_count=count,
                )
            )

        related.sort(
            key=lambda r: (-r.mention_count, r.section_number, r.subdivision or "")
        )
        return RelatedStatutesResponse(
            source_statute_id=statute_id, related=related
        )


@router.post("/statutes/search", response_model=StatuteSearchResponse)
def search_statutes(payload: StatuteSearchRequest) -> StatuteSearchResponse:
    """Hybrid statute search.

    - `query` is required (free text or a citation).
    - `factor` is optional; must byte-exact match one of the 17 factors from
      `GET /factors`.
    - Citation-shaped queries short-circuit to an exact match.
    """

    if payload.factor is not None and not is_known_factor(payload.factor):
        raise HTTPException(
            status_code=400,
            detail=(
                f"unknown factor {payload.factor!r}; must be one of the values "
                "from GET /factors"
            ),
        )

    hits = retrieve(
        query=payload.query,
        factor=payload.factor,
        jurisdiction=payload.jurisdiction,
        top_k=payload.top_k,
    )
    return StatuteSearchResponse(
        query=payload.query,
        factor=payload.factor,
        jurisdiction=payload.jurisdiction,
        top_k=payload.top_k,
        results=[_hit_to_out(h) for h in hits],
    )


@router.get("/jurisdictions", response_model=JurisdictionsResponse)
def list_jurisdictions() -> JurisdictionsResponse:
    """Count of statutes per jurisdiction. Sorted by jurisdiction code."""
    with get_session() as session:
        rows = session.execute(
            select(
                Statute.jurisdiction,
                func.count(Statute.id),
            ).group_by(Statute.jurisdiction).order_by(Statute.jurisdiction)
        ).all()
    return JurisdictionsResponse(
        jurisdictions=[
            JurisdictionCount(jurisdiction=jur, statute_count=int(cnt))
            for jur, cnt in rows
        ]
    )


@router.get("/factors", response_model=FactorsResponse)
def list_factors() -> FactorsResponse:
    """Count of distinct statutes per factor, alphabetical.

    Always returns all 17 factors — zero-count factors stay in the list so
    the UI dropdown is stable across deploys (and so judges see we know the
    full taxonomy even if a category has no labeled statutes yet)."""

    with get_session() as session:
        rows = session.execute(
            select(
                StatuteFactor.factor,
                func.count(func.distinct(StatuteFactor.statute_id)),
            ).group_by(StatuteFactor.factor)
        ).all()

    counts_by_factor = {factor: int(count) for factor, count in rows}
    factors = [
        FactorCount(factor=factor, statute_count=counts_by_factor.get(factor, 0))
        for factor in FACTORS
    ]
    return FactorsResponse(factors=factors)


def _hit_to_out(hit: StatuteHit) -> StatuteHitOut:
    return StatuteHitOut(
        statute_id=hit.statute_id,
        universal_citation=hit.universal_citation,
        jurisdiction=hit.jurisdiction,
        code_name=hit.code_name,
        section_number=hit.section_number,
        subdivision=hit.subdivision,
        division=hit.division,
        chapter=hit.chapter,
        statute_text=hit.statute_text,
        complete_statute=hit.complete_statute,
        official_url=hit.official_url,
        score=hit.score,
        factors=hit.factors,
        matched_via=hit.matched_via,
    )
