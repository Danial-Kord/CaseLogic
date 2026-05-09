"""Agent runtime — bounded Anthropic tool-use loop.

Pattern (one assistant turn):

  1. Load + trim stored history from `chat_messages`.
  2. Append the new user message; persist it immediately so a crash mid-turn
     doesn't drop the user's input.
  3. Loop up to `chat_max_steps` times:
       - call `client.messages.create(messages=..., tools=ALL_TOOLS, ...)`
       - if `stop_reason != "tool_use"`, we're done; persist the assistant
         response and break.
       - otherwise, dispatch each tool_use block to the matching source
         module, build tool_result blocks, persist them, and append to
         the in-memory message list for the next iteration.
  4. Auto-title the session from the first user message.
  5. Return `AgentTurn` describing the final assistant text + tool calls +
     accumulated source hits — that's what `routes_chat.py` serializes to
     `ChatTurnOut`.

Idempotency / robustness:
  - We persist the user message *before* calling Claude. If Claude errors,
    the next request can resume from a clean state.
  - We persist tool_result blocks the same turn they were produced. Even
    if max_steps trips, history stays balanced for the next turn.

Mockability:
  - `anthropic_client` and `web_client` are injectable. Tests pass fakes
    so no network is required.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from sqlalchemy.orm import Session

from backend.agent import history
from backend.agent.prompts import SYSTEM_PROMPT
from backend.agent.sources import statute as statute_source
from backend.agent.sources import web as web_source
from backend.config import Settings, load_settings

log = logging.getLogger(__name__)


# `on_event(event_type, payload)` callback type. The agent loop fires this
# at every interesting moment so callers (e.g. the SSE stream route) can
# show a live trace of what the model is doing — not just the final answer.
#
# Event types and payload shape:
#   - "started"     : {} — very first event, before anything happens
#   - "thinking"    : {"step": int, "label": str} — about to call Claude
#   - "thought"     : {"text": str} — Claude emitted intermediate prose
#                     between tool calls (the model's own reasoning)
#   - "tool_start"  : {"name": str, "label": str, "input": dict}
#   - "tool_done"   : {"name": str, "summary": str, "count": int | None}
#   - "drafting"    : {} — Claude has stopped tool-using; final answer next
#
# Callbacks must be cheap and non-blocking — they fire on the agent's
# worker thread. The route handler bridges them to an asyncio.Queue.
OnEventFn = Callable[[str, dict[str, Any]], None]


def _noop_on_event(_event_type: str, _payload: dict[str, Any]) -> None:
    pass


# ----------------------------------------------------------- public types


@dataclass
class AgentTurn:
    """The result of one assistant turn."""

    session_id: str
    session_title: str | None
    assistant_text: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    statute_hits: list[statute_source.StatuteToolHit] = field(default_factory=list)
    web_hits: list[web_source.WebToolHit] = field(default_factory=list)
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class AnthropicLike(Protocol):
    """Slice of `anthropic.Anthropic` we depend on. Lets tests pass a fake."""

    @property
    def messages(self) -> Any: ...  # has .create(...)


# ----------------------------------------------------------- public entry


def run_agent_turn(
    *,
    db: Session,
    session_id: str | None,
    user_message: str,
    settings: Settings | None = None,
    anthropic_client: AnthropicLike | None = None,
    web_client: web_source.WebSearchClient | None = None,
    on_event: OnEventFn | None = None,
    enable_web: bool = True,
) -> AgentTurn:
    """Run one chat turn end-to-end.

    Pass `session_id=None` to create a new session inline (the route uses an
    explicit `POST /chat/sessions` endpoint for the API, but inline creation
    keeps tests + scripted callers ergonomic).

    `on_event` is fired at each interesting moment of the loop so callers
    can render a live trace (see `OnEventFn` for the event vocabulary).
    Default is a no-op so non-streaming callers don't change.

    `enable_web` controls whether the web_search tool schema is exposed to
    Claude this turn. When False, Claude only sees the local statute tools
    and physically cannot call web_search — nothing to suppress at the UI
    layer afterwards. Default True preserves existing behavior.

    Returns an `AgentTurn`. The caller is responsible for committing the
    `Session` so all writes — user message, assistant response, tool results,
    session timestamp, optional title — land atomically.
    """

    s = settings or load_settings()
    emit: OnEventFn = on_event or _noop_on_event
    user_message = user_message.strip()
    if not user_message:
        raise ValueError("user_message must be non-empty")

    emit("started", {})

    # --- 1. Resolve / create session
    if session_id is None:
        session_id = str(uuid.uuid4())
        history.create_session(db, session_id)
    elif history.get_session_row(db, session_id) is None:
        raise SessionNotFound(session_id)

    is_first_turn = history.next_turn_index(db, session_id) == 0

    # --- 2. Persist user message before calling Claude
    user_idx = history.next_turn_index(db, session_id)
    history.persist_user_message(
        db, session_id, user_message, next_turn_index=user_idx
    )
    db.flush()

    # --- 3. Build the message list to send Claude
    stored = history.load_history(db, session_id, cap=s.chat_history_cap)
    messages: list[dict[str, Any]] = history.to_anthropic_messages(stored)

    # --- 4. Tool-use loop
    client = anthropic_client or _build_anthropic(s)
    tools = _all_tool_schemas(enable_web=enable_web)
    tool_calls_log: list[dict[str, Any]] = []
    statute_hits: list[statute_source.StatuteToolHit] = []
    web_hits: list[web_source.WebToolHit] = []
    final_text = ""
    final_blocks: list[dict[str, Any]] | None = None

    for step in range(s.chat_max_steps):
        emit(
            "thinking",
            {
                "step": step,
                "label": (
                    "Reading your question\u2026"
                    if step == 0
                    else "Reasoning over the results\u2026"
                ),
            },
        )

        response = client.messages.create(
            model=s.chat_model,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
            max_tokens=2048,
        )
        assistant_blocks = _normalize_blocks(getattr(response, "content", []))
        stop_reason = getattr(response, "stop_reason", None)

        # Always persist what Claude said this round, even if it's a partial
        # turn that will follow up with tool calls.
        next_idx = history.next_turn_index(db, session_id)
        history.persist_assistant_blocks(
            db, session_id, assistant_blocks, next_turn_index=next_idx
        )
        db.flush()

        messages.append({"role": "assistant", "content": assistant_blocks})

        # Surface any narrating text Claude emitted alongside the tool_use
        # blocks ("Let me check the statute on red lights..."). These are
        # the closest thing to a free-form thinking trace from the model
        # without enabling extended thinking and paying for reasoning tokens.
        for block in assistant_blocks:
            if block.get("type") == "text":
                text = (block.get("text") or "").strip()
                if text:
                    emit("thought", {"text": text})

        if stop_reason != "tool_use":
            final_text = _join_text_blocks(assistant_blocks)
            final_blocks = assistant_blocks
            emit("drafting", {})
            break

        tool_use_blocks = [b for b in assistant_blocks if b.get("type") == "tool_use"]
        if not tool_use_blocks:
            # stop_reason said tool_use but we got none — bail safely.
            final_text = _join_text_blocks(assistant_blocks)
            final_blocks = assistant_blocks
            emit("drafting", {})
            break

        tool_result_blocks: list[dict[str, Any]] = []
        for tu in tool_use_blocks:
            name = tu.get("name") or ""
            tool_input = tu.get("input") or {}
            tool_use_id = tu.get("id") or ""

            emit(
                "tool_start",
                {
                    "name": name,
                    "label": _describe_tool_call(name, tool_input),
                    "input": tool_input,
                },
            )

            try:
                output = _dispatch_tool(
                    name=name,
                    tool_input=tool_input,
                    db=db,
                    settings=s,
                    web_client=web_client,
                )
            except Exception as exc:  # defensive — never crash the turn
                log.exception("tool %s raised", name)
                output_payload = {"error": f"{type(exc).__name__}: {exc}"}
                tool_result_blocks.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": json.dumps(output_payload, ensure_ascii=False),
                        "is_error": True,
                    }
                )
                tool_calls_log.append(
                    {
                        "name": name,
                        "input": tool_input,
                        "result_summary": f"error: {exc}",
                    }
                )
                emit(
                    "tool_done",
                    {"name": name, "summary": f"error: {exc}", "count": None},
                )
                continue

            tool_calls_log.append(
                {
                    "name": name,
                    "input": tool_input,
                    "result_summary": output.summary,
                }
            )
            new_statute_hits = list(getattr(output, "statute_hits", []) or [])
            new_web_hits = list(getattr(output, "web_hits", []) or [])
            statute_hits.extend(new_statute_hits)
            web_hits.extend(new_web_hits)

            count: int | None
            if name == "search_statutes":
                count = len(new_statute_hits)
            elif name == "web_search":
                count = len(new_web_hits)
            elif name == "get_statute":
                count = 1 if new_statute_hits else 0
            else:
                count = None

            emit(
                "tool_done",
                {
                    "name": name,
                    "summary": _describe_tool_result(name, output, count),
                    "count": count,
                },
            )

            tool_result_blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": json.dumps(output.payload, ensure_ascii=False),
                }
            )

        # Persist the tool_results as a single message and add to the chain.
        next_idx = history.next_turn_index(db, session_id)
        history.persist_tool_results(
            db, session_id, tool_result_blocks, next_turn_index=next_idx
        )
        db.flush()
        messages.append({"role": "user", "content": tool_result_blocks})
    else:
        # Loop exhausted without a final response — surface a graceful note.
        log.warning("agent loop hit max_steps=%d without final answer", s.chat_max_steps)
        if final_blocks is None:
            final_text = (
                "I ran out of reasoning steps before completing this answer. "
                "Try a more focused question."
            )
            next_idx = history.next_turn_index(db, session_id)
            history.persist_assistant_blocks(
                db,
                session_id,
                [{"type": "text", "text": final_text}],
                next_turn_index=next_idx,
            )

    # --- 5. Auto-title and bump updated_at
    title = _autotitle(user_message) if is_first_turn else None
    history.touch_session(db, session_id, title=title)

    session_row = history.get_session_row(db, session_id)
    return AgentTurn(
        session_id=session_id,
        session_title=session_row.title if session_row else None,
        assistant_text=final_text or "",
        tool_calls=tool_calls_log,
        statute_hits=_dedupe_statutes(statute_hits),
        web_hits=_dedupe_web(web_hits),
    )


class SessionNotFound(Exception):
    """Raised by `run_agent_turn` if the caller passes a session_id that
    isn't in the DB. The route handler converts this to a 404."""

    def __init__(self, session_id: str) -> None:
        super().__init__(f"chat session {session_id!r} not found")
        self.session_id = session_id


# ----------------------------------------------------------- internals


def _build_anthropic(s: Settings) -> AnthropicLike:
    if not s.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is required for /chat. Set it in .env or pass "
            "anthropic_client= explicitly."
        )
    import anthropic  # lazy

    return anthropic.Anthropic(api_key=s.anthropic_api_key)


def _all_tool_schemas(*, enable_web: bool = True) -> list[dict[str, Any]]:
    """Build the tool schema list for one turn.

    Statute tools are always on. Web tools are gated by `enable_web` so the
    user can opt out per-message — when off, Claude literally doesn't see
    the web_search tool, which is more reliable than letting it call and
    then filtering after the fact.
    """

    schemas: list[dict[str, Any]] = list(statute_source.TOOL_SCHEMAS)
    if enable_web:
        schemas.extend(web_source.TOOL_SCHEMAS)
    return schemas


_STATUTE_TOOL_NAMES = {t["name"] for t in statute_source.TOOL_SCHEMAS}
_WEB_TOOL_NAMES = {t["name"] for t in web_source.TOOL_SCHEMAS}


def _dispatch_tool(
    *,
    name: str,
    tool_input: dict[str, Any],
    db: Session,
    settings: Settings,
    web_client: web_source.WebSearchClient | None,
) -> Any:
    if name in _STATUTE_TOOL_NAMES:
        return statute_source.run(name, tool_input, db=db)
    if name in _WEB_TOOL_NAMES:
        return web_source.run(name, tool_input, settings=settings, client=web_client)
    raise ValueError(f"agent: no tool registered as {name!r}")


def _normalize_blocks(content: Any) -> list[dict[str, Any]]:
    """Coerce an Anthropic response.content (list of pydantic BaseModel
    instances) into our JSON-serializable block shape."""

    out: list[dict[str, Any]] = []
    for block in content or []:
        # Real anthropic SDK returns BaseModel; tests may pass plain dicts.
        if isinstance(block, dict):
            out.append(_clean_block(block))
            continue
        block_type = getattr(block, "type", None)
        if block_type == "text":
            out.append({"type": "text", "text": getattr(block, "text", "")})
        elif block_type == "tool_use":
            out.append(
                {
                    "type": "tool_use",
                    "id": getattr(block, "id", ""),
                    "name": getattr(block, "name", ""),
                    "input": getattr(block, "input", {}) or {},
                }
            )
        else:
            # Unknown block — keep type only, drop opaque payload.
            out.append({"type": block_type or "unknown"})
    return out


def _clean_block(block: dict[str, Any]) -> dict[str, Any]:
    block_type = block.get("type")
    if block_type == "text":
        return {"type": "text", "text": block.get("text", "")}
    if block_type == "tool_use":
        return {
            "type": "tool_use",
            "id": block.get("id", ""),
            "name": block.get("name", ""),
            "input": block.get("input", {}) or {},
        }
    if block_type == "tool_result":
        out: dict[str, Any] = {
            "type": "tool_result",
            "tool_use_id": block.get("tool_use_id", ""),
            "content": block.get("content", ""),
        }
        if block.get("is_error"):
            out["is_error"] = True
        return out
    return {"type": block_type or "unknown"}


def _join_text_blocks(blocks: list[dict[str, Any]]) -> str:
    pieces = [b.get("text", "") for b in blocks if b.get("type") == "text"]
    return "\n".join(p for p in pieces if p).strip()


def _describe_tool_call(name: str, tool_input: dict[str, Any]) -> str:
    """Human-readable label for a tool invocation. Surfaced in the live
    thinking trace the frontend renders during a chat turn."""

    if name == "search_statutes":
        query = (tool_input.get("query") or "").strip()
        factor = (tool_input.get("factor") or "").strip()
        if factor:
            return f"Searching CA Vehicle Code for \u201c{query}\u201d (factor: {factor})"
        return f"Searching CA Vehicle Code for \u201c{query}\u201d"
    if name == "get_statute":
        statute_id = (tool_input.get("statute_id") or "").strip() or "?"
        return f"Looking up statute {statute_id}"
    if name == "web_search":
        query = (tool_input.get("query") or "").strip()
        return f"Searching the web for \u201c{query}\u201d"
    return f"Calling tool: {name}"


def _describe_tool_result(name: str, output: Any, count: int | None) -> str:
    """One-line summary of a tool result for the live trace.

    Falls back to the tool's own `summary` string if we don't have a
    specialized phrasing — that way new tools aren't silently mislabeled.
    """

    if name == "search_statutes":
        if count == 0:
            return "No matching statutes found"
        return f"Found {count} statute{'s' if count != 1 else ''}"
    if name == "get_statute":
        return "Read full statute" if count else "Statute not found"
    if name == "web_search":
        if count == 0:
            return "No whitelisted web sources found"
        return f"Found {count} web result{'s' if count != 1 else ''}"
    return getattr(output, "summary", "") or f"{name} done"


def _autotitle(user_message: str) -> str:
    """One-line title for the session sidebar — first ~80 chars of the user
    message, single line, no markdown."""

    flat = re.sub(r"\s+", " ", user_message).strip()
    if len(flat) <= 80:
        return flat
    return flat[:77].rstrip() + "\u2026"


def _dedupe_statutes(
    hits: list[statute_source.StatuteToolHit],
) -> list[statute_source.StatuteToolHit]:
    seen: set[str] = set()
    out: list[statute_source.StatuteToolHit] = []
    for h in hits:
        if h.statute_id in seen:
            continue
        seen.add(h.statute_id)
        out.append(h)
    return out


def _dedupe_web(hits: list[web_source.WebToolHit]) -> list[web_source.WebToolHit]:
    seen: set[str] = set()
    out: list[web_source.WebToolHit] = []
    for h in hits:
        if h.url in seen:
            continue
        seen.add(h.url)
        out.append(h)
    return out
