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
