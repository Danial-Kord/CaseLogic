"""Chat session endpoints.

The frontend's multi-chat sidebar talks to:

- `GET    /chats`              — list all chats (id, title, timestamps, msg count)
- `POST   /chats`              — create a new (empty) chat
- `GET    /chats/{chat_id}`    — fetch one chat with its full message history
- `DELETE /chats/{chat_id}`    — delete a chat (cascades to messages)
- `POST   /chats/{chat_id}/messages` — append a user message; runs retrieval +
  Claude; persists both messages; returns them with the retrieved statute hits
  attached to the assistant message so the client can render the table inline.
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from backend.api.schemas import (
    ChatCreateRequest,
    ChatListResponse,
    ChatMessageOut,
    ChatOut,
    ChatSummary,
    SendMessageRequest,
    SendMessageResponse,
    StatuteHitOut,
)
from backend.chat.service import respond_to_query
from backend.db import get_session
from backend.models import Chat, ChatMessage
from backend.retrieval import StatuteHit

router = APIRouter(prefix="/chats", tags=["chats"])


def _new_chat_id() -> str:
    return uuid.uuid4().hex[:12]


def _hit_to_out_dict(hit: StatuteHit) -> dict:
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
    ).model_dump(mode="json")


def _msg_to_out(msg: ChatMessage) -> ChatMessageOut:
    hits: list[StatuteHitOut] = []
    if msg.hits_json:
        try:
            hits = [StatuteHitOut(**h) for h in json.loads(msg.hits_json)]
        except (ValueError, TypeError):
            hits = []
    return ChatMessageOut(
        id=msg.id,
        role=msg.role,
        content=msg.content,
        hits=hits,
        created_at=msg.created_at,
    )


def _chat_to_summary(chat: Chat) -> ChatSummary:
    return ChatSummary(
        chat_id=chat.chat_id,
        title=chat.title,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        message_count=len(chat.messages),
    )


@router.get("", response_model=ChatListResponse)
def list_chats() -> ChatListResponse:
    with get_session() as session:
        chats = session.scalars(
            select(Chat).order_by(Chat.updated_at.desc())
        ).all()
        return ChatListResponse(chats=[_chat_to_summary(c) for c in chats])


@router.post("", response_model=ChatOut)
def create_chat(payload: ChatCreateRequest | None = None) -> ChatOut:
    title = (payload.title if payload else None) or "New chat"
    with get_session() as session:
        chat = Chat(chat_id=_new_chat_id(), title=title)
        session.add(chat)
        session.flush()
        return ChatOut(
            chat_id=chat.chat_id,
            title=chat.title,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            messages=[],
        )


@router.get("/{chat_id}", response_model=ChatOut)
def get_chat(chat_id: str) -> ChatOut:
    with get_session() as session:
        chat = session.scalar(select(Chat).where(Chat.chat_id == chat_id))
        if not chat:
            raise HTTPException(status_code=404, detail="chat not found")
        return ChatOut(
            chat_id=chat.chat_id,
            title=chat.title,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            messages=[_msg_to_out(m) for m in chat.messages],
        )


@router.delete("/{chat_id}")
def delete_chat(chat_id: str) -> dict:
    with get_session() as session:
        chat = session.scalar(select(Chat).where(Chat.chat_id == chat_id))
        if not chat:
            raise HTTPException(status_code=404, detail="chat not found")
        session.delete(chat)
        return {"deleted": chat_id}


@router.post("/{chat_id}/messages", response_model=SendMessageResponse)
def send_message(chat_id: str, payload: SendMessageRequest) -> SendMessageResponse:
    # Run retrieval + LLM *outside* the DB session to keep the transaction
    # short — Claude can take seconds.
    text, hits = respond_to_query(
        payload.content, factor=payload.factor, top_k=payload.top_k
    )
    hits_json = json.dumps([_hit_to_out_dict(h) for h in hits])

    with get_session() as session:
        chat = session.scalar(select(Chat).where(Chat.chat_id == chat_id))
        if not chat:
            raise HTTPException(status_code=404, detail="chat not found")

        # Auto-title from the first user message; first ~60 chars.
        if chat.title == "New chat" and not chat.messages:
            chat.title = payload.content.strip()[:60] or "New chat"

        user_msg = ChatMessage(
            chat_id=chat_id, role="user", content=payload.content
        )
        session.add(user_msg)

        assistant_msg = ChatMessage(
            chat_id=chat_id,
            role="assistant",
            content=text,
            hits_json=hits_json,
        )
        session.add(assistant_msg)
        session.flush()

        return SendMessageResponse(
            user_message=_msg_to_out(user_msg),
            assistant_message=_msg_to_out(assistant_msg),
            chat_title=chat.title,
        )
