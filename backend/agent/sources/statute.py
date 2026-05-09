"""Statute tools for the chat agent — hybrid search + slug lookup.

Two tools are registered with Claude:

- `search_statutes(query, factor?, top_k?)` — wraps
  `backend.retrieval.hybrid_search.retrieve` (citation fast-path + RRF).
- `get_statute(statute_id)` — exact slug lookup against `Statute`.

Both produce `StatuteToolHit` records that the agent loop accumulates as
`SourceHit(kind='statute', ...)` so the frontend can show what was retrieved
each turn.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.extraction.factors import is_known_factor
from backend.models import Statute
from backend.retrieval import retrieve

# ------------------------------------------------------------ tool schemas

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "search_statutes",
        "description": (
            "Search the local California Vehicle Code corpus by free text or "
            "by citation (e.g. '21453(a)'). Returns the top-K most relevant "
            "statutes with snippets and a stable statute_id. ALWAYS prefer "
            "this over web_search for CA Vehicle Code questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Free-text query or a citation string.",
                },
                "factor": {
                    "type": "string",
                    "description": (
                        "Optional contributing-factor filter (byte-exact, "
                        "from the 17-factor taxonomy)."
                    ),
                },
                "top_k": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 20,
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_statute",
        "description": (
            "Fetch the full text of a single statute by its slug (e.g. "
            "'ca-veh-21453-a'). Use this after search_statutes to read the "
            "complete section before citing a specific subdivision."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "statute_id": {
                    "type": "string",
                    "description": "Canonical slug, e.g. 'ca-veh-22350'.",
                },
            },
            "required": ["statute_id"],
        },
    },
]


# ------------------------------------------------------------ result types


@dataclass
class StatuteToolHit:
    """Source record for a single statute the agent retrieved or fetched."""

    statute_id: str
    universal_citation: str
    snippet: str
    score: float
    matched_via: str
    official_url: str
    factors: list[str] = field(default_factory=list)

    def as_source_dict(self) -> dict[str, Any]:
        return {
            "statute_id": self.statute_id,
            "universal_citation": self.universal_citation,
            "snippet": self.snippet,
            "score": self.score,
            "matched_via": self.matched_via,
            "official_url": self.official_url,
            "factors": list(self.factors),
        }


@dataclass
class ToolOutput:
    """Result of executing one tool call inside the agent loop."""

    payload: Any  # JSON-serializable; sent back to Claude
    statute_hits: list[StatuteToolHit] = field(default_factory=list)
    summary: str = ""  # short human-readable line for the frontend


# ------------------------------------------------------------------ run


def run(name: str, tool_input: dict[str, Any], *, db: Session) -> ToolOutput:
    """Dispatch a `search_statutes` or `get_statute` call. Caller passes the
    name back from the Anthropic tool_use block."""

    if name == "search_statutes":
        return _run_search(tool_input)
    if name == "get_statute":
        return _run_get(tool_input, db=db)
    raise ValueError(f"statute.run: unknown tool {name!r}")


# ------------------------------------------------------------ implementations


def _run_search(tool_input: dict[str, Any]) -> ToolOutput:
    query = (tool_input.get("query") or "").strip()
    if not query:
        return ToolOutput(
            payload={"results": [], "note": "empty query"},
            summary="search_statutes: empty query",
        )

    factor = tool_input.get("factor")
    if factor and not is_known_factor(factor):
        return ToolOutput(
            payload={
                "results": [],
                "note": f"unknown factor {factor!r}; ignored",
            },
            summary=f"search_statutes: unknown factor {factor!r}",
        )

    top_k = int(tool_input.get("top_k") or 5)
    top_k = max(1, min(top_k, 20))

    hits = retrieve(query=query, factor=factor, top_k=top_k)

    statute_hits = [
        StatuteToolHit(
            statute_id=h.statute_id,
            universal_citation=h.universal_citation,
            snippet=_snippet(h.statute_text),
            score=h.score,
            matched_via=h.matched_via,
            official_url=h.official_url,
            factors=list(h.factors),
        )
        for h in hits
    ]

    payload = {
        "query": query,
        "factor": factor,
        "results": [
            {
                "statute_id": h.statute_id,
                "citation": h.universal_citation,
                "snippet": h.snippet,
                "score": round(h.score, 4),
                "matched_via": h.matched_via,
                "official_url": h.official_url,
                "factors": h.factors,
            }
            for h in statute_hits
        ],
    }
    summary = (
        f"search_statutes({query!r}{', factor=' + repr(factor) if factor else ''}): "
        f"{len(statute_hits)} hit(s)"
    )
    return ToolOutput(payload=payload, statute_hits=statute_hits, summary=summary)


def _run_get(tool_input: dict[str, Any], *, db: Session) -> ToolOutput:
    statute_id = (tool_input.get("statute_id") or "").strip()
    if not statute_id:
        return ToolOutput(
            payload={"error": "missing statute_id"},
            summary="get_statute: missing statute_id",
        )

    statute = db.scalar(
        select(Statute)
        .where(Statute.statute_id == statute_id)
        .options(selectinload(Statute.factors))
    )
    if statute is None:
        return ToolOutput(
            payload={"error": f"statute {statute_id!r} not found"},
            summary=f"get_statute({statute_id}): not found",
        )

    factors = sorted({f.factor for f in statute.factors})
    hit = StatuteToolHit(
        statute_id=statute.statute_id,
        universal_citation=statute.universal_citation,
        snippet=_snippet(statute.statute_text),
        score=1.0,
        matched_via="lookup",
        official_url=statute.official_url,
        factors=factors,
    )
    payload = {
        "statute_id": statute.statute_id,
        "citation": statute.universal_citation,
        "jurisdiction": statute.jurisdiction,
        "code_name": statute.code_name,
        "section_number": statute.section_number,
        "subdivision": statute.subdivision,
        "division": statute.division,
        "chapter": statute.chapter,
        "statute_text": statute.statute_text,
        "complete_statute": statute.complete_statute,
        "official_url": statute.official_url,
        "factors": factors,
    }
    return ToolOutput(
        payload=payload,
        statute_hits=[hit],
        summary=f"get_statute({statute_id}): ok",
    )


def _snippet(text: str, *, limit: int = 280) -> str:
    """Trim long statute text for source previews. Source tracking still
    points the frontend to the full statute via `get_statute` if the user
    wants to dig in."""

    if not text:
        return ""
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "\u2026"
