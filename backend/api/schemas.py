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
    jurisdiction: Optional[str] = Field(
        None,
        description="Limit results to one jurisdiction: CA, FL, NY, or WA.",
    )
    top_k: int = Field(10, ge=1, le=50)


class StatuteSearchResponse(BaseModel):
    query: str
    factor: Optional[str] = None
    jurisdiction: Optional[str] = None
    top_k: int
    results: list[StatuteHitOut]


class RelatedStatute(BaseModel):
    """One statute referenced from another statute's text.

    `mention_count` is how many times this row's citation/section number
    appears in the source statute's combined text — used as a primitive
    "edge weight" so the graph can size or sort nodes by relevance.
    """

    statute_id: str
    universal_citation: str
    jurisdiction: str
    section_number: str
    subdivision: Optional[str] = None
    snippet: str = Field(
        "",
        description="Short preview from the related statute, ~160 chars.",
    )
    mention_count: int = Field(1, ge=1)


class RelatedStatutesResponse(BaseModel):
    """Outgoing references from one statute. Edges only — the source row is
    NOT included; the caller already has it."""

    source_statute_id: str
    related: list[RelatedStatute]


class JurisdictionCount(BaseModel):
    jurisdiction: str
    statute_count: int


class JurisdictionsResponse(BaseModel):
    jurisdictions: list[JurisdictionCount]


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


# ---------------------------------------------------------------- chat schemas
#
# The chat surface lives alongside Phase-1 statute search. It is conversational
# (sessions persisted in DB), multi-source (statute DB + Firecrawl web search),
# and uses Anthropic tool use directly. See `backend/agent/` for the runtime.


class ChatRequest(BaseModel):
    """`POST /chat` body. If `session_id` is omitted, the route creates a new
    session before running the turn — keeps the frontend single-shot."""

    session_id: Optional[str] = Field(
        None,
        description="UUID of an existing chat session. Omit to start a new one.",
    )
    message: str = Field(..., min_length=1, max_length=4000)


class WebHitOut(BaseModel):
    """One web result returned by the agent's `web_search` tool."""

    url: str
    title: Optional[str] = None
    snippet: Optional[str] = None
    domain: str


class ChatStatuteHit(BaseModel):
    """Trimmed statute hit returned to the frontend per chat turn — same fields
    as `StatuteHitOut` for now, named separately so we can diverge later (e.g.
    drop `complete_statute` to keep payloads small)."""

    statute_id: str
    universal_citation: str
    snippet: str
    score: float
    matched_via: str
    official_url: str


class ChatSourceOut(BaseModel):
    """Discriminated union over the source kinds the agent can cite.

    `kind == 'statute'` populates `statute`; `kind == 'web'` populates `web`.
    """

    kind: str  # 'statute' | 'web'
    statute: Optional[ChatStatuteHit] = None
    web: Optional[WebHitOut] = None


class ChatToolCallOut(BaseModel):
    """One tool invocation inside an assistant turn — surfaced to the frontend
    so the user can see *what* the agent did, not just the final answer."""

    name: str
    input: dict
    result_summary: str


class ChatTurnOut(BaseModel):
    """The newly produced assistant turn for a `POST /chat` response."""

    assistant_text: str
    tool_calls: list[ChatToolCallOut] = Field(default_factory=list)
    sources: list[ChatSourceOut] = Field(default_factory=list)
    created_at: datetime


class ChatResponse(BaseModel):
    """`POST /chat` response."""

    session_id: str
    session_title: Optional[str] = None
    turn: ChatTurnOut


class ChatMessageOut(BaseModel):
    """One persisted message in `GET /chat/sessions/{id}`. Mirrors the row in
    the `chat_messages` table; `content` is the parsed JSON block list."""

    role: str
    content: list[dict]
    created_at: datetime


class ChatSessionOut(BaseModel):
    """Full session with replayed messages."""

    session_id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageOut] = Field(default_factory=list)


class ChatSessionListItem(BaseModel):
    """Lightweight summary used by `GET /chat/sessions`. Omits messages."""

    session_id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    message_count: int


class ChatSessionListResponse(BaseModel):
    sessions: list[ChatSessionListItem]


class ChatSessionCreateResponse(BaseModel):
    session_id: str
    created_at: datetime


# --- Profile (single-user demo) ---------------------------------------------


class ProfileOut(BaseModel):
    name: str = ""
    role: str = ""
    firm: str = ""
    about: str = ""
    updated_at: Optional[datetime] = None


class ProfileUpdate(BaseModel):
    name: str = Field("", max_length=128)
    role: str = Field("", max_length=128)
    firm: str = Field("", max_length=256)
    about: str = Field("", max_length=2048)
