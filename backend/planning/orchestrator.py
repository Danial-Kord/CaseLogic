"""Planning orchestrator — sequential sub-agent dispatcher.

Public entry: `run_plan(db, plan_id, incident_text, *, on_event, ...)`.

Flow:

  1. Mark `Plan.status = "running"`.
  2. Retrieve statutes for the incident via the existing hybrid retriever
     (we reuse `backend.retrieval.retrieve` so the planner sees the same
     evidence the chat agent would).
  3. Build a JSON-friendly statute payload (slug, citation, full text,
     factors) once and pass it into each sub-agent.
  4. Sequentially run cases -> contacts -> brief. Each section is
     persisted as a `PlanSection` row immediately on completion so the
     plan is recoverable mid-stream — if the brief fails, the user still
     keeps the cases + contacts output.
  5. On completion, mark `Plan.status = "done"`. On any uncaught error,
     `status = "error"` with the partial sections preserved.

`on_event` is the same callback shape used by the chat agent, fired at
each observable moment so the SSE route can stream a live trace:

  - "started"     : {} — the orchestrator accepted the request
  - "retrieving"  : {} — about to call `retrieve()`
  - "retrieved"   : {"count": int} — N statutes fetched
  - "agent_start" : {"kind": str, "label": str}
  - "agent_done"  : {"kind": str, "content_md": str}
  - "error"       : {"detail": str} — turn aborted

The terminal "final" event is emitted by the route handler, not the
orchestrator (so it can include the freshly-loaded `PlanDetail` shape
the frontend expects).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import Settings, load_settings
from backend.models import Plan, PlanSection, Statute
from backend.planning import sub_brief, sub_cases, sub_contacts
from backend.retrieval import retrieve as hybrid_retrieve

log = logging.getLogger(__name__)


# Event vocabulary — see module docstring.
OnEventFn = Callable[[str, dict[str, Any]], None]

# Section-kind constants. Matched on the frontend so the same strings
# drive section ordering, titles, and chip styling.
KIND_CASES = "related_cases"
KIND_CONTACTS = "contacts"
KIND_BRIEF = "brief"
SECTION_KINDS = (KIND_CASES, KIND_CONTACTS, KIND_BRIEF)

# Cap how many statutes we send into each sub-agent. The retrieval call
# may return many; the planner's job is to be focused, not exhaustive.
DEFAULT_TOP_K = 8


def _noop_on_event(_event_type: str, _payload: dict[str, Any]) -> None:
    pass


class AnthropicLike(Protocol):
    """Same Protocol as `backend.agent.loop.AnthropicLike`. Repeated here
    rather than imported to keep the planning package self-contained."""

    @property
    def messages(self) -> Any: ...  # has .create(...)


class PlanNotFound(Exception):
    """Raised when `run_plan` is given a plan_id that isn't in the DB."""

    def __init__(self, plan_id: str) -> None:
        super().__init__(f"plan {plan_id!r} not found")
        self.plan_id = plan_id


@dataclass
class PlanResult:
    """Lightweight result object returned by `run_plan`. The route layer
    re-loads the full `Plan` row to build the API response."""

    plan_id: str
    status: str  # "done" | "error"
    sections: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


# -------------------------------------------------------- public entry


def run_plan(
    *,
    db: Session,
    plan_id: str,
    incident_text: str,
    settings: Settings | None = None,
    anthropic_client: AnthropicLike | None = None,
    on_event: OnEventFn | None = None,
    top_k: int = DEFAULT_TOP_K,
) -> PlanResult:
    """Run all three sub-agents sequentially and persist their output."""

    s = settings or load_settings()
    emit: OnEventFn = on_event or _noop_on_event

    plan = db.scalar(select(Plan).where(Plan.plan_id == plan_id))
    if plan is None:
        raise PlanNotFound(plan_id)

    plan.status = "running"
    plan.updated_at = _utcnow()
    db.flush()

    emit("started", {})

    # ---- 1. Retrieval
    emit("retrieving", {})
    try:
        hits = hybrid_retrieve(query=incident_text, top_k=top_k)
    except Exception as exc:
        log.exception("planner retrieval failed")
        return _fail(db, plan, emit, f"retrieval failed: {exc}")

    statute_payload = _build_statute_payload(db, hits)
    emit("retrieved", {"count": len(statute_payload)})

    sections: list[dict[str, Any]] = []
    client = anthropic_client or _build_anthropic(s)

    # ---- 2. Cases
    cases_md = _run_section(
        db=db,
        plan=plan,
        kind=KIND_CASES,
        label="Drafting related cases",
        emit=emit,
        runner=lambda: sub_cases.run(
            client=client,
            model=s.chat_model,
            incident_text=incident_text,
            statutes=statute_payload,
        ),
        statute_payload=statute_payload,
        sections_acc=sections,
    )
    if cases_md is None:
        return _result_with_partial(plan.plan_id, "error", sections, "cases sub-agent failed")

    # ---- 3. Contacts
    contacts_md = _run_section(
        db=db,
        plan=plan,
        kind=KIND_CONTACTS,
        label="Drafting people to reach out",
        emit=emit,
        runner=lambda: sub_contacts.run(
            client=client,
            model=s.chat_model,
            incident_text=incident_text,
            statutes=statute_payload,
        ),
        statute_payload=statute_payload,
        sections_acc=sections,
    )
    if contacts_md is None:
        return _result_with_partial(plan.plan_id, "error", sections, "contacts sub-agent failed")

    # ---- 4. Brief
    brief_md = _run_section(
        db=db,
        plan=plan,
        kind=KIND_BRIEF,
        label="Drafting recommended brief",
        emit=emit,
        runner=lambda: sub_brief.run(
            client=client,
            model=s.chat_model,
            incident_text=incident_text,
            statutes=statute_payload,
            cases_md=cases_md,
            contacts_md=contacts_md,
        ),
        statute_payload=statute_payload,
        sections_acc=sections,
    )
    if brief_md is None:
        return _result_with_partial(plan.plan_id, "error", sections, "brief sub-agent failed")

    # ---- 5. Finalize
    plan.status = "done"
    plan.updated_at = _utcnow()
    if not plan.title:
        plan.title = _autotitle(incident_text)
    db.flush()

    return PlanResult(plan_id=plan.plan_id, status="done", sections=sections)


# -------------------------------------------------------- internals


def _run_section(
    *,
    db: Session,
    plan: Plan,
    kind: str,
    label: str,
    emit: OnEventFn,
    runner: Callable[[], Any],
    statute_payload: list[dict[str, Any]],
    sections_acc: list[dict[str, Any]],
) -> str | None:
    """Execute one sub-agent, persist its row, append to the in-memory
    section list, and emit lifecycle events. Returns the markdown text on
    success, or None on failure (caller short-circuits the whole run)."""

    emit("agent_start", {"kind": kind, "label": label})
    try:
        result = runner()
    except Exception as exc:
        log.exception("planner sub-agent %s raised", kind)
        emit("error", {"detail": f"{kind}: {exc}"})
        return None

    cited = _extract_cited_slugs(result.content_md, statute_payload)

    metadata = {"cited_statute_ids": cited}
    section_row = PlanSection(
        plan_id_fk=plan.plan_id,
        kind=kind,
        content_md=result.content_md,
        metadata_json=json.dumps(metadata, ensure_ascii=False),
    )
    db.add(section_row)
    db.flush()

    section_dict = {
        "kind": kind,
        "content_md": result.content_md,
        "cited_statute_ids": cited,
    }
    sections_acc.append(section_dict)

    emit(
        "agent_done",
        {
            "kind": kind,
            "content_md": result.content_md,
            "cited_statute_ids": cited,
        },
    )
    return result.content_md


def _build_statute_payload(
    db: Session, hits: list[Any]
) -> list[dict[str, Any]]:
    """Re-fetch full statute rows so the sub-agents see complete text and
    factor tags. Falls back to the hit's snippet when the row is missing
    (shouldn't happen in practice; guards against stale Chroma indexes)."""

    if not hits:
        return []

    slugs = [h.statute_id for h in hits]
    rows = list(db.scalars(select(Statute).where(Statute.statute_id.in_(slugs))))
    by_slug = {r.statute_id: r for r in rows}

    out: list[dict[str, Any]] = []
    for h in hits:
        row = by_slug.get(h.statute_id)
        if row is None:
            out.append(
                {
                    "statute_id": h.statute_id,
                    "universal_citation": h.universal_citation,
                    "jurisdiction": h.jurisdiction,
                    "section_number": h.section_number,
                    "subdivision": h.subdivision,
                    "statute_text": h.statute_text,
                    "complete_statute": h.complete_statute,
                    "official_url": h.official_url,
                    "factors": list(h.factors or []),
                }
            )
            continue
        out.append(
            {
                "statute_id": row.statute_id,
                "universal_citation": row.universal_citation,
                "jurisdiction": row.jurisdiction,
                "section_number": row.section_number,
                "subdivision": row.subdivision,
                "statute_text": row.statute_text,
                "complete_statute": row.complete_statute,
                "official_url": row.official_url,
                "factors": sorted({f.factor for f in (row.factors or [])}),
            }
        )
    return out


_CITE_RE = re.compile(r"\[cite:\s*([a-z0-9-]+)\s*\]", re.IGNORECASE)


def _extract_cited_slugs(
    content_md: str, statute_payload: list[dict[str, Any]]
) -> list[str]:
    """Pull `[cite: <statute_id>]` markers out of the markdown and keep
    only those that match a slug we actually passed in. Order is
    preserved (first mention wins), duplicates are collapsed.
    """
    valid = {s["statute_id"] for s in statute_payload}
    seen: set[str] = set()
    out: list[str] = []
    for m in _CITE_RE.finditer(content_md or ""):
        slug = m.group(1).lower()
        if slug in valid and slug not in seen:
            seen.add(slug)
            out.append(slug)
    return out


def _fail(
    db: Session,
    plan: Plan,
    emit: OnEventFn,
    detail: str,
) -> PlanResult:
    plan.status = "error"
    plan.updated_at = _utcnow()
    db.flush()
    emit("error", {"detail": detail})
    return PlanResult(plan_id=plan.plan_id, status="error", error=detail)


def _result_with_partial(
    plan_id: str,
    status: str,
    sections: list[dict[str, Any]],
    error: str | None,
) -> PlanResult:
    return PlanResult(
        plan_id=plan_id,
        status=status,
        sections=list(sections),
        error=error,
    )


def _build_anthropic(s: Settings) -> AnthropicLike:
    if not s.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is required for /plans. Set it in .env or pass "
            "anthropic_client= explicitly."
        )
    import anthropic  # lazy import — same pattern as the chat agent

    return anthropic.Anthropic(api_key=s.anthropic_api_key)


def _autotitle(incident_text: str) -> str:
    flat = re.sub(r"\s+", " ", incident_text).strip()
    if len(flat) <= 80:
        return flat
    return flat[:77].rstrip() + "\u2026"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


__all__ = [
    "PlanNotFound",
    "PlanResult",
    "SECTION_KINDS",
    "KIND_CASES",
    "KIND_CONTACTS",
    "KIND_BRIEF",
    "run_plan",
]
