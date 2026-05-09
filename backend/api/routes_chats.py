"""Frontend-facing chat surface (`/chats`).

Thin adapter on top of `backend.agent.loop.run_agent_turn` that speaks the
contract `frontend/lib/api.ts` was built against:

- `chat_id` instead of `session_id`,
- flat `content: string` per message (the user-visible answer text),
- a rich `hits: StatuteHit[]` array per assistant message, joined from the
  `statutes` table so the frontend can re-render result cards on reload,
- a single send endpoint that returns both the user and assistant rows
  plus the (possibly auto-generated) chat title.

The lower-level `/chat` and `/chat/sessions` routes in `routes_chat.py`
stay where they are — they back the smoke tests and the demo curl scripts.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Path, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.agent import run_agent_turn
from backend.agent.history import (
    ROLE_ASSISTANT,
    ROLE_USER,
    get_session_row,
)
from backend.agent.loop import AgentTurn, SessionNotFound
from backend.db import get_session
from backend.models import ChatMessage, ChatSession, Statute

router = APIRouter(prefix="/chats", tags=["chats"])

log = logging.getLogger(__name__)

DEFAULT_TITLE = "New chat"


# ---------------------------------------------------------------- schemas


class FrontendStatuteHit(BaseModel):
    """Mirror of `frontend/lib/types.ts#StatuteHit` — the shape the existing
    `ResultsPanel` component renders."""

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
    matched_via: str


class FrontendChatMessage(BaseModel):
    """Mirror of `frontend/lib/types.ts#ChatMessage`."""

    id: int
    role: str  # 'user' | 'assistant'
    content: str
    hits: list[FrontendStatuteHit] = Field(default_factory=list)
    created_at: datetime


class ChatSummaryOut(BaseModel):
    """Mirror of `frontend/lib/types.ts#ChatSummary`."""

    chat_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int


class ChatListResponse(BaseModel):
    chats: list[ChatSummaryOut]


class ChatDetailOut(BaseModel):
    """Mirror of `frontend/lib/types.ts#ChatDetail`."""

    chat_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[FrontendChatMessage] = Field(default_factory=list)


class CreateChatRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=256)


class SendMessageRequest(BaseModel):
    """Mirror of `frontend/lib/types.ts#SendMessageRequest`.

    `factor` and `top_k` are accepted for forward-compat but the agent loop
    drives its own retrieval through Claude tool calls — we don't pre-filter
    here. Including them in the request keeps the API surface stable for
    when we wire factor-locked search back in.
    """

    content: str = Field(..., min_length=1, max_length=4000)
    factor: Optional[str] = None
    top_k: Optional[int] = Field(None, ge=1, le=50)


class SendMessageResponse(BaseModel):
    user_message: FrontendChatMessage
    assistant_message: FrontendChatMessage
    chat_title: str


# ----------------------------------------------------------- GET /chats


@router.get("", response_model=ChatListResponse)
def list_chats() -> ChatListResponse:
    """Most-recently-updated first. Counts messages so the sidebar can
    show "3 msg" without loading the bodies."""

    with get_session() as db:
        rows = list(
            db.execute(
                select(
                    ChatSession.session_id,
                    ChatSession.title,
                    ChatSession.created_at,
                    ChatSession.updated_at,
                    func.count(ChatMessage.id),
                )
                .outerjoin(
                    ChatMessage,
                    ChatMessage.session_id_fk == ChatSession.session_id,
                )
                .group_by(ChatSession.id)
                .order_by(ChatSession.updated_at.desc())
            ).all()
        )

    chats = [
        ChatSummaryOut(
            chat_id=session_id,
            title=title or DEFAULT_TITLE,
            created_at=created_at,
            updated_at=updated_at,
            # message_count from the frontend's perspective: only the user-
            # visible messages, not the internal tool_result rows. Approx by
            # halving since each turn is user+assistant; correct for our
            # single-shot pattern.
            message_count=int(message_count),
        )
        for session_id, title, created_at, updated_at, message_count in rows
    ]
    return ChatListResponse(chats=chats)


# --------------------------------------------------------- POST /chats


@router.post("", response_model=ChatDetailOut, status_code=status.HTTP_201_CREATED)
def create_chat(payload: CreateChatRequest | None = None) -> ChatDetailOut:
    """Create an empty chat the frontend can pin before the first message.

    If the caller doesn't pass an explicit title, we leave the DB column
    NULL and substitute the placeholder only at response time. That lets
    `history.touch_session` auto-generate a title from the first user
    message — `touch_session` skips the write if `row.title` is already
    set, so a placeholder like "New chat" would otherwise stick forever.
    """

    chat_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    explicit_title = payload.title if payload else None

    with get_session() as db:
        db.add(
            ChatSession(
                session_id=chat_id,
                title=explicit_title,
                created_at=now,
                updated_at=now,
            )
        )

    return ChatDetailOut(
        chat_id=chat_id,
        title=explicit_title or DEFAULT_TITLE,
        created_at=now,
        updated_at=now,
        messages=[],
    )


# ------------------------------------------------- GET /chats/{chat_id}


@router.get("/{chat_id}", response_model=ChatDetailOut)
def get_chat(
    chat_id: str = Path(..., min_length=8, max_length=64),
) -> ChatDetailOut:
    """Replay one chat with all user-visible messages.

    Internal `tool_result` rows are filtered out. Assistant rows whose only
    content is `tool_use` blocks (no text) are also dropped — they're a
    thinking step, not part of the user-visible thread.
    """

    with get_session() as db:
        row = get_session_row(db, chat_id)
        if row is None:
            raise HTTPException(status_code=404, detail="chat not found")

        messages = list(
            db.scalars(
                select(ChatMessage)
                .where(ChatMessage.session_id_fk == chat_id)
                .order_by(ChatMessage.turn_index.asc())
            )
        )

        rendered = _render_messages(messages)

        return ChatDetailOut(
            chat_id=row.session_id,
            title=row.title or DEFAULT_TITLE,
            created_at=row.created_at,
            updated_at=row.updated_at,
            messages=rendered,
        )


# ---------------------------------------------- DELETE /chats/{chat_id}


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: str = Path(..., min_length=8, max_length=64),
) -> Response:
    with get_session() as db:
        row = get_session_row(db, chat_id)
        if row is None:
            raise HTTPException(status_code=404, detail="chat not found")
        db.delete(row)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------- POST /chats/{chat_id}/messages


@router.post("/{chat_id}/messages", response_model=SendMessageResponse)
def send_message(
    payload: SendMessageRequest,
    chat_id: str = Path(..., min_length=8, max_length=64),
) -> SendMessageResponse:
    """Send a user message and return both the user + assistant rows in the
    shape the existing ChatThread component expects.

    Non-streaming. For a live progress trace, use the `/stream` variant.
    """

    with get_session() as db:
        try:
            turn: AgentTurn = run_agent_turn(
                db=db,
                session_id=chat_id,
                user_message=payload.content,
            )
        except SessionNotFound:
            raise HTTPException(status_code=404, detail="chat not found")
        return _build_send_response(db, chat_id, payload.content, turn)


# ------------------------------ POST /chats/{chat_id}/messages/stream


@router.post("/{chat_id}/messages/stream")
async def stream_message(
    payload: SendMessageRequest,
    chat_id: str = Path(..., min_length=8, max_length=64),
) -> StreamingResponse:
    """Same as `/messages` but streams a live trace of the agent's tool
    calls and reasoning over Server-Sent Events.

    Event types (each frame is `data: <json>\\n\\n`):

      - `started`    : the agent has accepted the request
      - `thinking`   : { step, label } — Claude is being called
      - `thought`    : { text } — Claude emitted intermediate reasoning
      - `tool_start` : { name, label, input }
      - `tool_done`  : { name, summary, count }
      - `drafting`   : Claude is composing the final answer
      - `final`      : { user_message, assistant_message, chat_title }
      - `error`      : { detail, status }

    The terminal event is always `final` or `error` — the stream closes
    immediately after.
    """

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[tuple[str | None, dict[str, Any]]] = asyncio.Queue()

    def on_event(event_type: str, data: dict[str, Any]) -> None:
        # Fired on the worker thread; bridge it onto the event loop.
        loop.call_soon_threadsafe(queue.put_nowait, (event_type, data))

    def run_in_thread() -> None:
        try:
            with get_session() as db:
                try:
                    turn: AgentTurn = run_agent_turn(
                        db=db,
                        session_id=chat_id,
                        user_message=payload.content,
                        on_event=on_event,
                    )
                except SessionNotFound:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        ("error", {"detail": "chat not found", "status": 404}),
                    )
                    loop.call_soon_threadsafe(queue.put_nowait, (None, {}))
                    return
                response = _build_send_response(db, chat_id, payload.content, turn)
            loop.call_soon_threadsafe(
                queue.put_nowait,
                ("final", response.model_dump(mode="json")),
            )
        except Exception as exc:  # defensive — never wedge the stream
            log.exception("stream_message: agent raised")
            loop.call_soon_threadsafe(
                queue.put_nowait,
                ("error", {"detail": str(exc), "status": 500}),
            )
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, (None, {}))

    asyncio.create_task(asyncio.to_thread(run_in_thread))

    async def sse_iter() -> AsyncIterator[bytes]:
        # Send a comment first so the client knows the stream opened. Some
        # proxies buffer until the first byte; this also primes nginx etc.
        yield b": chat-stream open\n\n"
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
            "X-Accel-Buffering": "no",  # disable nginx buffering for SSE
            "Connection": "keep-alive",
        },
    )


def _build_send_response(
    db: Session,
    chat_id: str,
    user_text: str,
    turn: AgentTurn,
) -> SendMessageResponse:
    """Shared post-agent handling for both /messages and /messages/stream.

    Enriches statute hits against the `statutes` table, persists the hit
    JSON onto the final assistant row so reloads keep rendering result
    cards, and returns the frontend-shaped pair.
    """

    enriched_hits = _enrich_hits(db, turn.statute_hits)
    assistant_row = _last_assistant_row(db, chat_id)
    if assistant_row is not None:
        assistant_row.hits_json = json.dumps(
            [h.model_dump(mode="json") for h in enriched_hits],
            ensure_ascii=False,
        )

    user_row = _last_user_row(db, chat_id)
    session_row = get_session_row(db, chat_id)
    title = (session_row.title if session_row else None) or DEFAULT_TITLE

    user_message = FrontendChatMessage(
        id=user_row.id if user_row else 0,
        role="user",
        content=user_text,
        hits=[],
        created_at=user_row.created_at if user_row else turn.created_at,
    )
    assistant_message = FrontendChatMessage(
        id=assistant_row.id if assistant_row else 0,
        role="assistant",
        content=turn.assistant_text or "",
        hits=enriched_hits,
        created_at=assistant_row.created_at if assistant_row else turn.created_at,
    )

    return SendMessageResponse(
        user_message=user_message,
        assistant_message=assistant_message,
        chat_title=title,
    )


# ---------------------------------------------------------------- helpers


def _last_user_row(db: Session, chat_id: str) -> ChatMessage | None:
    return db.scalar(
        select(ChatMessage)
        .where(ChatMessage.session_id_fk == chat_id)
        .where(ChatMessage.role == ROLE_USER)
        .order_by(ChatMessage.turn_index.desc())
        .limit(1)
    )


def _last_assistant_row(db: Session, chat_id: str) -> ChatMessage | None:
    return db.scalar(
        select(ChatMessage)
        .where(ChatMessage.session_id_fk == chat_id)
        .where(ChatMessage.role == ROLE_ASSISTANT)
        .order_by(ChatMessage.turn_index.desc())
        .limit(1)
    )


def _join_text_blocks(content: list[dict[str, Any]]) -> str:
    pieces = [
        b.get("text", "")
        for b in content
        if isinstance(b, dict) and b.get("type") == "text"
    ]
    return "\n".join(p for p in pieces if p).strip()


def _parse_blocks(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, list):
        return [b for b in parsed if isinstance(b, dict)]
    if isinstance(parsed, dict):
        return [parsed]
    return []


def _parse_hits(raw: str | None) -> list[FrontendStatuteHit]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    out: list[FrontendStatuteHit] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        try:
            out.append(FrontendStatuteHit.model_validate(item))
        except Exception:  # tolerate stale shapes from older rows
            continue
    return out


def _render_messages(rows: list[ChatMessage]) -> list[FrontendChatMessage]:
    """Project stored ChatMessage rows into the flat shape the frontend
    expects. Skips internal tool_result rows and empty assistant rows."""

    out: list[FrontendChatMessage] = []
    for row in rows:
        if row.role == ROLE_USER:
            blocks = _parse_blocks(row.content_json)
            text = _join_text_blocks(blocks)
            if not text:
                continue
            out.append(
                FrontendChatMessage(
                    id=row.id,
                    role="user",
                    content=text,
                    hits=[],
                    created_at=row.created_at,
                )
            )
        elif row.role == ROLE_ASSISTANT:
            blocks = _parse_blocks(row.content_json)
            text = _join_text_blocks(blocks)
            if not text:
                # mid-turn tool-only step; not user-visible
                continue
            out.append(
                FrontendChatMessage(
                    id=row.id,
                    role="assistant",
                    content=text,
                    hits=_parse_hits(row.hits_json),
                    created_at=row.created_at,
                )
            )
        # ROLE_TOOL_RESULT — internal, not surfaced
    return out


def _enrich_hits(db: Session, statute_hits: list[Any]) -> list[FrontendStatuteHit]:
    """Join the agent's lightweight `StatuteToolHit` records against the
    `statutes` table to build full `FrontendStatuteHit` records.

    Order is preserved (the agent already deduped). Hits whose statute_id
    no longer exists in the DB are dropped silently — better to omit a row
    than to render an unverifiable card.
    """

    if not statute_hits:
        return []

    ids = [h.statute_id for h in statute_hits]
    rows = list(
        db.scalars(
            select(Statute)
            .where(Statute.statute_id.in_(ids))
            .options(selectinload(Statute.factors))
        )
    )
    by_id = {s.statute_id: s for s in rows}

    enriched: list[FrontendStatuteHit] = []
    for h in statute_hits:
        statute = by_id.get(h.statute_id)
        if statute is None:
            log.warning(
                "agent returned statute_id %s with no row in statutes table",
                h.statute_id,
            )
            continue
        enriched.append(
            FrontendStatuteHit(
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
                score=h.score,
                factors=sorted({f.factor for f in statute.factors}),
                matched_via=h.matched_via,
            )
        )
    return enriched
