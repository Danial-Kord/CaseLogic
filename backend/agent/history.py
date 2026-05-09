"""Chat history persistence + replay.

`content_json` on `ChatMessage` stores the full Anthropic block list
(`[{type:"text",...}, {type:"tool_use",...}, {type:"tool_result",...}]`).
Storing the raw block format means we can:

1. Send it back into `client.messages.create(messages=[...])` without
   reconstruction — every tool_use on disk has its matching tool_result.
2. Render the same data in the frontend without double-conversion.

Trim policy: when the stored history exceeds `chat_history_cap`, we drop
the oldest **complete user-turn** (user → assistant pair) so we never split
a tool_use from its tool_result. That would otherwise 400 from Anthropic.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import ChatMessage, ChatSession

# Roles we persist on `ChatMessage.role`. Anthropic only knows 'user' and
# 'assistant', but we also tag stored tool_result messages so the frontend
# can hide them or render them as a debug chip.
ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"
ROLE_TOOL_RESULT = "tool_result"

ALL_ROLES = (ROLE_USER, ROLE_ASSISTANT, ROLE_TOOL_RESULT)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class StoredMessage:
    """One row from the chat_messages table, parsed."""

    role: str
    content: list[dict[str, Any]]
    created_at: datetime
    turn_index: int


# --------------------------------------------------------------- session glue


def get_session_row(db: Session, session_id: str) -> ChatSession | None:
    return db.scalar(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )


def create_session(db: Session, session_id: str) -> ChatSession:
    row = ChatSession(session_id=session_id)
    db.add(row)
    db.flush()
    return row


# ------------------------------------------------------------ load (replay)


def load_history(
    db: Session,
    session_id: str,
    *,
    cap: int,
) -> list[StoredMessage]:
    """Return stored messages in chronological order, trimmed to `cap`.

    Trimming drops the oldest *user-turn pair* (user message + the assistant
    + tool_result rows that follow it) so we never split a tool_use block
    from its tool_result. Anthropic 400s if the chain is unbalanced.
    """

    rows = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id_fk == session_id)
            .order_by(ChatMessage.turn_index.asc())
        )
    )
    parsed: list[StoredMessage] = []
    for row in rows:
        try:
            content = json.loads(row.content_json)
        except json.JSONDecodeError:
            continue
        parsed.append(
            StoredMessage(
                role=row.role,
                content=content if isinstance(content, list) else [content],
                created_at=row.created_at,
                turn_index=row.turn_index,
            )
        )

    if cap <= 0 or len(parsed) <= cap:
        return parsed

    # Walk forward, dropping whole user-bounded segments until we fit.
    while len(parsed) > cap:
        # Find the start of the second user-turn; everything before it goes.
        cut = _next_user_index(parsed, start=1)
        if cut is None:
            break
        parsed = parsed[cut:]
    return parsed


def _next_user_index(messages: list[StoredMessage], *, start: int) -> int | None:
    for i in range(start, len(messages)):
        if messages[i].role == ROLE_USER:
            return i
    return None


def to_anthropic_messages(history: list[StoredMessage]) -> list[dict[str, Any]]:
    """Project stored messages into the format `client.messages.create` wants.

    Anthropic only has 'user' and 'assistant' roles. Our stored 'tool_result'
    rows go back as role='user' with the original tool_result block content.
    """

    out: list[dict[str, Any]] = []
    for msg in history:
        if msg.role == ROLE_ASSISTANT:
            out.append({"role": "assistant", "content": msg.content})
        else:
            # user message OR tool_result — both go up as role='user'.
            out.append({"role": "user", "content": msg.content})
    return out


# ----------------------------------------------------------------- persist


def persist_user_message(
    db: Session,
    session_id: str,
    user_text: str,
    *,
    next_turn_index: int,
) -> None:
    db.add(
        ChatMessage(
            session_id_fk=session_id,
            turn_index=next_turn_index,
            role=ROLE_USER,
            content_json=json.dumps(
                [{"type": "text", "text": user_text}], ensure_ascii=False
            ),
        )
    )


def persist_assistant_blocks(
    db: Session,
    session_id: str,
    blocks: list[dict[str, Any]],
    *,
    next_turn_index: int,
) -> None:
    db.add(
        ChatMessage(
            session_id_fk=session_id,
            turn_index=next_turn_index,
            role=ROLE_ASSISTANT,
            content_json=json.dumps(blocks, ensure_ascii=False),
        )
    )


def persist_tool_results(
    db: Session,
    session_id: str,
    tool_result_blocks: list[dict[str, Any]],
    *,
    next_turn_index: int,
) -> None:
    db.add(
        ChatMessage(
            session_id_fk=session_id,
            turn_index=next_turn_index,
            role=ROLE_TOOL_RESULT,
            content_json=json.dumps(tool_result_blocks, ensure_ascii=False),
        )
    )


def next_turn_index(db: Session, session_id: str) -> int:
    rows = list(
        db.scalars(
            select(ChatMessage.turn_index)
            .where(ChatMessage.session_id_fk == session_id)
            .order_by(ChatMessage.turn_index.desc())
            .limit(1)
        )
    )
    return (rows[0] + 1) if rows else 0


def touch_session(db: Session, session_id: str, *, title: str | None = None) -> None:
    row = get_session_row(db, session_id)
    if row is None:
        return
    row.updated_at = _utcnow()
    if title is not None and not row.title:
        row.title = title[:256]
