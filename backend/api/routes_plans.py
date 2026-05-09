"""Planning workspace API surface (`/plans`).

Five routes that back the `/plans` page in the frontend:

  - GET    /plans                 — list past plans for the sidebar
  - POST   /plans                 — create a plan row (status="running"),
                                    don't generate yet
  - GET    /plans/{plan_id}       — full detail (with all sections)
  - POST   /plans/{plan_id}/run/stream — kick off generation, stream SSE
  - DELETE /plans/{plan_id}       — cascade-delete the plan + sections

The split between create and run-stream lets the frontend create the
plan synchronously (so the sidebar updates immediately and we have a
stable plan_id), then open an EventSource against `/run/stream` for the
live trace. Same pattern as `/chats` + `/chats/{id}/messages/stream`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Path, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_session
from backend.models import Plan, PlanSection
from backend.planning import (
    KIND_BRIEF,
    KIND_CASES,
    KIND_CONTACTS,
    SECTION_KINDS,
    PlanNotFound,
    run_plan,
)

router = APIRouter(prefix="/plans", tags=["plans"])
log = logging.getLogger(__name__)

DEFAULT_TITLE = "Untitled plan"


# ---------------------------------------------------------------- schemas


class PlanSectionOut(BaseModel):
    """One persisted section. `kind` is one of `SECTION_KINDS`.

    `cited_statute_ids` is the slug list extracted from the markdown and
    cached in `metadata_json` — the frontend uses it to render clickable
    chips that open the StatuteModal.
    """

    kind: str
    content_md: str
    cited_statute_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class PlanSummaryOut(BaseModel):
    """Sidebar row. Cheap to load — no section bodies."""

    plan_id: str
    title: str
    status: str
    section_count: int
    created_at: datetime
    updated_at: datetime


class PlanDetailOut(BaseModel):
    plan_id: str
    title: str
    status: str
    incident_text: str
    sections: list[PlanSectionOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PlanListResponse(BaseModel):
    plans: list[PlanSummaryOut]


class CreatePlanRequest(BaseModel):
    incident_text: str = Field(..., min_length=4, max_length=8000)


class CreatePlanResponse(BaseModel):
    plan_id: str
    title: str
    status: str


# ----------------------------------------------------------- GET /plans


@router.get("", response_model=PlanListResponse)
def list_plans() -> PlanListResponse:
    """Most-recently-updated first. Counts sections so the sidebar can
    show progress without loading bodies."""

    with get_session() as db:
        rows = list(
            db.scalars(
                select(Plan).order_by(Plan.updated_at.desc())
            )
        )
        plans = [
            PlanSummaryOut(
                plan_id=row.plan_id,
                title=row.title or DEFAULT_TITLE,
                status=row.status,
                section_count=len(row.sections or []),
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ]
    return PlanListResponse(plans=plans)


# ----------------------------------------------------------- POST /plans


@router.post("", response_model=CreatePlanResponse, status_code=201)
def create_plan(payload: CreatePlanRequest) -> CreatePlanResponse:
    """Create a new plan in 'running' state. Generation hasn't started
    yet — call `/plans/{id}/run/stream` afterwards to fan out to the
    sub-agents.
    """

    plan_id = uuid.uuid4().hex
    title = _autotitle(payload.incident_text)

    with get_session() as db:
        plan = Plan(
            plan_id=plan_id,
            title=title,
            incident_text=payload.incident_text.strip(),
            status="running",
        )
        db.add(plan)

    return CreatePlanResponse(plan_id=plan_id, title=title, status="running")


# -------------------------------------------------- GET /plans/{plan_id}


@router.get("/{plan_id}", response_model=PlanDetailOut)
def get_plan(
    plan_id: str = Path(..., min_length=8, max_length=64),
) -> PlanDetailOut:
    with get_session() as db:
        row = db.scalar(select(Plan).where(Plan.plan_id == plan_id))
        if row is None:
            raise HTTPException(status_code=404, detail="plan not found")
        return _to_detail(row)


# ----------------------------------------------- DELETE /plans/{plan_id}


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: str = Path(..., min_length=8, max_length=64),
) -> Response:
    with get_session() as db:
        row = db.scalar(select(Plan).where(Plan.plan_id == plan_id))
        if row is None:
            raise HTTPException(status_code=404, detail="plan not found")
        db.delete(row)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------- POST /plans/{plan_id}/run/stream


@router.post("/{plan_id}/run/stream")
async def run_plan_stream(
    plan_id: str = Path(..., min_length=8, max_length=64),
) -> StreamingResponse:
    """Kick off the planning run and stream its events as SSE.

    Each frame is `data: <json>\\n\\n`. Event vocabulary mirrors
    `backend.planning.orchestrator.OnEventFn` plus a terminal `final` /
    `error` frame the route handler emits with the full PlanDetail
    payload (so the client can drop its EventSource and have everything
    it needs to render).
    """

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[tuple[Optional[str], dict[str, Any]]] = asyncio.Queue()

    def on_event(event_type: str, data: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, (event_type, data))

    def run_in_thread() -> None:
        try:
            with get_session() as db:
                plan = db.scalar(select(Plan).where(Plan.plan_id == plan_id))
                if plan is None:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        ("error", {"detail": "plan not found", "status": 404}),
                    )
                    loop.call_soon_threadsafe(queue.put_nowait, (None, {}))
                    return
                incident_text = plan.incident_text

            with get_session() as db:
                try:
                    run_plan(
                        db=db,
                        plan_id=plan_id,
                        incident_text=incident_text,
                        on_event=on_event,
                    )
                except PlanNotFound:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        ("error", {"detail": "plan not found", "status": 404}),
                    )
                    loop.call_soon_threadsafe(queue.put_nowait, (None, {}))
                    return

            # Re-load with sections for the final event.
            with get_session() as db:
                row = db.scalar(select(Plan).where(Plan.plan_id == plan_id))
                if row is not None:
                    detail = _to_detail(row)
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        ("final", detail.model_dump(mode="json")),
                    )
        except Exception as exc:  # never wedge the stream
            log.exception("run_plan_stream: orchestrator raised")
            loop.call_soon_threadsafe(
                queue.put_nowait,
                ("error", {"detail": str(exc), "status": 500}),
            )
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, (None, {}))

    asyncio.create_task(asyncio.to_thread(run_in_thread))

    async def sse_iter() -> AsyncIterator[bytes]:
        # Comment frame so the client knows the stream opened. Some
        # proxies buffer until the first byte; this also primes nginx.
        yield b": plan-stream open\n\n"
        while True:
            event_type, data = await queue.get()
            if event_type is None:
                break
            payload_dict = {"type": event_type, **data}
            yield f"data: {json.dumps(payload_dict, ensure_ascii=False)}\n\n".encode(
                "utf-8"
            )

    return StreamingResponse(
        sse_iter(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------- helpers


def _to_detail(row: Plan) -> PlanDetailOut:
    """Project a `Plan` ORM row into the API response shape, with sections
    rendered in the stable order defined by `SECTION_KINDS`."""

    by_kind = {s.kind: s for s in (row.sections or [])}
    ordered: list[PlanSectionOut] = []
    for kind in SECTION_KINDS:
        s = by_kind.get(kind)
        if s is None:
            continue
        ordered.append(
            PlanSectionOut(
                kind=s.kind,
                content_md=s.content_md,
                cited_statute_ids=_parse_cited(s.metadata_json),
                created_at=s.created_at,
            )
        )
    # Tolerate any unexpected kind by appending it at the end.
    for s in row.sections or []:
        if s.kind not in SECTION_KINDS:
            ordered.append(
                PlanSectionOut(
                    kind=s.kind,
                    content_md=s.content_md,
                    cited_statute_ids=_parse_cited(s.metadata_json),
                    created_at=s.created_at,
                )
            )

    return PlanDetailOut(
        plan_id=row.plan_id,
        title=row.title or DEFAULT_TITLE,
        status=row.status,
        incident_text=row.incident_text,
        sections=ordered,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _parse_cited(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, dict):
        out = parsed.get("cited_statute_ids") or []
        if isinstance(out, list):
            return [str(s) for s in out]
    return []


def _autotitle(incident_text: str) -> str:
    flat = re.sub(r"\s+", " ", incident_text).strip()
    if not flat:
        return DEFAULT_TITLE
    if len(flat) <= 80:
        return flat
    return flat[:77].rstrip() + "\u2026"


# Keep a reference to satisfy linters that flag unused imports for the
# kind constants we re-exported from the orchestrator package.
_KINDS = (KIND_CASES, KIND_CONTACTS, KIND_BRIEF)
