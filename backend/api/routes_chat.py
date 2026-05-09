"""Chat endpoints: stateful conversation with the multi-source agent.

Routes:

- `POST   /chat`                       — send a message; returns the new turn.
- `POST   /chat/sessions`              — create an empty session.
- `GET    /chat/sessions`              — list recent sessions (no messages).
- `GET    /chat/sessions/{session_id}` — one session with replayed messages.
- `DELETE /chat/sessions/{session_id}` — 204; cascades to messages.

Session shape: see `backend.models.ChatSession` / `ChatMessage`. The agent
runtime lives in `backend.agent.loop`.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query, Response, status
from sqlalchemy import func, select

from backend.agent import run_agent_turn
from backend.agent.loop import AgentTurn, SessionNotFound
from backend.api.schemas import (
    ChatMessageOut,
    ChatRequest,
    ChatResponse,
    ChatSessionCreateResponse,
    ChatSessionListItem,
    ChatSessionListResponse,
    ChatSessionOut,
    ChatSourceOut,
    ChatStatuteHit,
    ChatToolCallOut,
    ChatTurnOut,
    WebHitOut,
)
from backend.db import get_session
from backend.models import ChatMessage, ChatSession

router = APIRouter(prefix="/chat", tags=["chat"])

log = logging.getLogger(__name__)


# ---------------------------------------------------------------- POST /chat


@router.post("", response_model=ChatResponse)
def post_chat(payload: ChatRequest) -> ChatResponse:
    """Send a single user message; returns the new assistant turn.

    If `session_id` is omitted, a fresh session is created server-side and
    returned in the response so the caller can pin it for follow-ups.
    """

    with get_session() as db:
        try:
            turn: AgentTurn = run_agent_turn(
                db=db,
                session_id=payload.session_id,
                user_message=payload.message,
            )
        except SessionNotFound:
            raise HTTPException(
                status_code=404,
                detail=f"chat session {payload.session_id!r} not found",
            )

    return ChatResponse(
        session_id=turn.session_id,
        session_title=turn.session_title,
        turn=ChatTurnOut(
            assistant_text=turn.assistant_text,
            tool_calls=[
                ChatToolCallOut(
                    name=tc["name"],
                    input=tc.get("input") or {},
                    result_summary=tc.get("result_summary") or "",
                )
                for tc in turn.tool_calls
            ],
            sources=_sources_from_turn(turn),
            created_at=turn.created_at,
        ),
    )


# -------------------------------------------------- POST /chat/sessions


@router.post(
    "/sessions",
    response_model=ChatSessionCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_chat_session() -> ChatSessionCreateResponse:
    """Create an empty session so the frontend can pin a UUID before the
    first message."""

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    with get_session() as db:
        db.add(ChatSession(session_id=session_id, created_at=now, updated_at=now))
    return ChatSessionCreateResponse(session_id=session_id, created_at=now)


# --------------------------------------------------- GET /chat/sessions


@router.get("/sessions", response_model=ChatSessionListResponse)
def list_chat_sessions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> ChatSessionListResponse:
    """Lightweight session list — most-recently-updated first."""

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
                .limit(limit)
                .offset(offset)
            ).all()
        )

    sessions = [
        ChatSessionListItem(
            session_id=session_id,
            title=title,
            created_at=created_at,
            updated_at=updated_at,
            message_count=int(message_count),
        )
        for session_id, title, created_at, updated_at, message_count in rows
    ]
    return ChatSessionListResponse(sessions=sessions)


# ------------------------------------------- GET /chat/sessions/{session_id}


@router.get("/sessions/{session_id}", response_model=ChatSessionOut)
def get_chat_session(
    session_id: str = Path(..., min_length=8, max_length=64),
) -> ChatSessionOut:
    """Full session, with messages replayed in chronological order."""

    with get_session() as db:
        row = db.scalar(
            select(ChatSession).where(ChatSession.session_id == session_id)
        )
        if row is None:
            raise HTTPException(status_code=404, detail="chat session not found")
        messages = list(
            db.scalars(
                select(ChatMessage)
                .where(ChatMessage.session_id_fk == session_id)
                .order_by(ChatMessage.turn_index.asc())
            )
        )

        return ChatSessionOut(
            session_id=row.session_id,
            title=row.title,
            created_at=row.created_at,
            updated_at=row.updated_at,
            messages=[_message_out(m) for m in messages],
        )


# ----------------------------------------- DELETE /chat/sessions/{session_id}


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat_session(
    session_id: str = Path(..., min_length=8, max_length=64),
) -> Response:
    """Delete a session and all its messages (cascade)."""

    with get_session() as db:
        row = db.scalar(
            select(ChatSession).where(ChatSession.session_id == session_id)
        )
        if row is None:
            raise HTTPException(status_code=404, detail="chat session not found")
        db.delete(row)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -------------------------------------------------------------- helpers


def _sources_from_turn(turn: AgentTurn) -> list[ChatSourceOut]:
    out: list[ChatSourceOut] = []
    for h in turn.statute_hits:
        out.append(
            ChatSourceOut(
                kind="statute",
                statute=ChatStatuteHit(
                    statute_id=h.statute_id,
                    universal_citation=h.universal_citation,
                    snippet=h.snippet,
                    score=h.score,
                    matched_via=h.matched_via,
                    official_url=h.official_url,
                ),
            )
        )
    for h in turn.web_hits:
        out.append(
            ChatSourceOut(
                kind="web",
                web=WebHitOut(
                    url=h.url,
                    title=h.title,
                    snippet=h.snippet,
                    domain=h.domain,
                ),
            )
        )
    return out


def _message_out(row: ChatMessage) -> ChatMessageOut:
    try:
        content: Any = json.loads(row.content_json)
    except json.JSONDecodeError:
        content = []
    if not isinstance(content, list):
        content = [content]
    return ChatMessageOut(
        role=row.role,
        content=content,
        created_at=row.created_at,
    )
