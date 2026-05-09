"""Pydantic request/response models for the Phase-1 statute API.

Frontend reads `docs/api.md` for the contract; these models are the source
of truth for that doc. `StatuteHitOut` mirrors `backend.retrieval.StatuteHit`
1:1 so route handlers can do a single field-by-field copy and nothing else.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class StatuteHitOut(BaseModel):
    """One result row in `POST /statutes/search`."""

    statute_id: str
    universal_citation: str
    jurisdiction: str
    code_name: str
    section_number: str
    subdivision: Optional[str] = None
    division: Optional[str] = None
    chapter: Optional[str] = None
    statute_text: str
    complete_statute: str
    official_url: str
    score: float
    factors: list[str] = Field(default_factory=list)
    matched_via: str = Field(
        "hybrid",
        description="How the result surfaced: 'citation', 'vector', 'keyword', or 'hybrid'.",
    )


class StatuteOut(BaseModel):
    """Full statute payload returned by `GET /statutes/{statute_id}`.

    Differs from `StatuteHitOut` only by lacking the `score` / `matched_via`
    fields (this is a direct lookup, not a ranked hit) and adding `retrieved_at`
    so the UI can surface freshness.
    """

    statute_id: str
    universal_citation: str
    jurisdiction: str
    code_name: str
    section_number: str
    subdivision: Optional[str] = None
    division: Optional[str] = None
    chapter: Optional[str] = None
    statute_text: str
    complete_statute: str
    official_url: str
    factors: list[str] = Field(default_factory=list)
    retrieved_at: Optional[datetime] = None


class StatuteSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=512)
    factor: Optional[str] = Field(
        None,
        description="One of the 17 factors from `GET /factors`. Byte-exact match.",
    )
    top_k: int = Field(10, ge=1, le=50)


class StatuteSearchResponse(BaseModel):
    query: str
    factor: Optional[str] = None
    top_k: int
    results: list[StatuteHitOut]


class FactorCount(BaseModel):
    factor: str
    statute_count: int


class FactorsResponse(BaseModel):
    factors: list[FactorCount]


class StatusResponse(BaseModel):
    """`GET /status` payload. Frontend's `DatasetStatus` panel reads this."""

    indexed_documents: int = Field(
        0,
        description="Generic web-document count (legacy `documents` table). Stays for back-compat.",
    )
    sample_urls: list[str] = Field(default_factory=list)
    indexed_statutes: int = 0
    jurisdictions: list[str] = Field(default_factory=list)
    last_eval_run_at: Optional[datetime] = None
    last_eval_recall_at_5: Optional[float] = None
    last_eval_citation_recall_at_1: Optional[float] = None
