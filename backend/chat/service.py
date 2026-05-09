"""Chat answer generation: hybrid retrieval + Claude prose summary.

If `ANTHROPIC_API_KEY` is set, we call Claude Sonnet 4.6 with the retrieved
statutes as grounding. If not set (or the call fails), we fall back to a
deterministic prose stub built from the same hits — so the chat surface
works end-to-end even without an API key.
"""

from __future__ import annotations

import logging
import os
from typing import Tuple

from sqlalchemy import select

from backend.db import get_session
from backend.models import Profile
from backend.retrieval import StatuteHit, retrieve

logger = logging.getLogger(__name__)


# Pinned per CLAUDE.md: latest Sonnet for chat — fast, capable, cheap.
CLAUDE_MODEL = "claude-sonnet-4-6"

ANSWER_SYSTEM_PROMPT = """\
You are a legal research assistant for personal injury law in California.
Your knowledge is strictly limited to the California Vehicle Code statutes
that the user provides as "Retrieved statutes" — you cite them, you do not
invent new ones.

Hard rules:
- Cite statutes by their universal_citation (e.g. "Cal. Veh. Code § 23152(a)").
- If the retrieved statutes do not directly address the question, say so plainly.
- Keep responses under ~180 words. Plain prose. Bullets only when listing 3+ statutes.
- Never claim something a retrieved statute does not say.
- Do NOT add a disclaimer like "Not legal advice" — the surrounding UI already
  shows one site-wide. Just answer the research question.
"""


def respond_to_query(
    query: str,
    factor: str | None = None,
    top_k: int = 50,
) -> Tuple[str, list[StatuteHit]]:
    """Run retrieval + LLM answer. Returns (answer_text, hits)."""

    hits = retrieve(query=query, factor=factor, top_k=top_k)
    profile_block = _profile_block()
    text = _answer(query, hits, profile_block)
    return text, hits


def _profile_block() -> str | None:
    """Read the demo profile and render it as a system-prompt block.
    Returns None if the profile is empty (no personalization)."""
    try:
        with get_session() as session:
            profile = session.scalar(select(Profile).limit(1))
    except Exception:  # pragma: no cover — DB may be missing during boot
        return None

    if profile is None:
        return None

    parts = []
    if profile.name:
        header = profile.name
        if profile.role:
            header += f", {profile.role}"
        if profile.firm:
            header += f" at {profile.firm}"
        parts.append(f"You are speaking with {header}.")
    if profile.about:
        parts.append(f"About them: {profile.about.strip()}")
    if not parts:
        return None
    parts.append(
        "Tailor depth, terminology, and which fact patterns you emphasize "
        "to this user. Do not address them by name in every message."
    )
    return "\n".join(parts)


def _answer(query: str, hits: list[StatuteHit], profile_block: str | None) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _stub_answer(query, hits)

    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        retrieved = _format_retrieved(hits)

        # Stable base prompt is cached; per-user profile is a separate block
        # so the cache hit rate stays high even when the profile changes.
        system_blocks: list[dict] = [
            {
                "type": "text",
                "text": ANSWER_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ]
        if profile_block:
            system_blocks.append({"type": "text", "text": profile_block})

        msg = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=400,
            system=system_blocks,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"User question: {query}\n\nRetrieved statutes:\n{retrieved}"
                    ),
                }
            ],
        )
        return _extract_text(msg)
    except Exception as e:
        logger.warning("anthropic call failed, falling back to stub: %s", e)
        return _stub_answer(query, hits, error=str(e))


def _format_retrieved(hits: list[StatuteHit]) -> str:
    if not hits:
        return "(none)"
    lines = []
    for i, h in enumerate(hits[:5], start=1):
        location = " · ".join(s for s in (h.division, h.chapter) if s) or "—"
        lines.append(f"{i}. {h.universal_citation} ({location})\n   {h.statute_text}")
    return "\n\n".join(lines)


def _extract_text(msg) -> str:
    parts = []
    for block in msg.content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "".join(parts).strip() or "[empty response]"


def _stub_answer(query: str, hits: list[StatuteHit], error: str | None = None) -> str:
    if not hits:
        return (
            f'No matching California Vehicle Code statutes found for "{query}". '
            'Try rephrasing or searching by citation (e.g. "Cal. Veh. Code § 23152").'
        )

    top = hits[:3]
    lines = ["Found the following potentially relevant statutes:\n"]
    for h in top:
        snippet = h.statute_text.strip()
        if len(snippet) > 220:
            snippet = snippet[:220].rstrip() + "…"
        lines.append(f"- **{h.universal_citation}** — {snippet}")

    out = "\n".join(lines)
    if error:
        out = f"_LLM unavailable, showing retrieval-only summary._\n\n{out}"
    return out
