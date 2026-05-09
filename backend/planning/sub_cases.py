"""Related-cases sub-agent.

Single Claude call: takes the orchestrator's retrieved statutes plus the
user's incident text and produces a markdown "Related cases & statutes"
section. No tools — the orchestrator does retrieval once and feeds it in.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Iterable

from backend.planning.prompts import SYSTEM_CASES


@dataclass
class SectionResult:
    """One sub-agent's output. `cited_statute_ids` is the subset of input
    slugs the model actually referenced, populated by the orchestrator
    via post-hoc parsing of the markdown so the frontend can show only
    the chips we actually wrote about."""

    content_md: str
    cited_statute_ids: list[str] = field(default_factory=list)


def run(
    *,
    client: Any,
    model: str,
    incident_text: str,
    statutes: Iterable[dict[str, Any]],
    max_tokens: int = 1500,
) -> SectionResult:
    """Run the cases sub-agent and return its markdown.

    `client` is an Anthropic-shaped object (real or fake) — same Protocol
    as `backend.agent.loop.AnthropicLike`. `statutes` is a list of dicts
    each containing: statute_id, universal_citation, statute_text,
    complete_statute (we send the full text so the model can reason about
    actual statutory language).
    """

    user_payload = _build_user_message(incident_text, list(statutes))

    response = client.messages.create(
        model=model,
        system=SYSTEM_CASES,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": user_payload}],
    )
    content_md = _join_text_blocks(response).strip()
    return SectionResult(content_md=content_md)


def _build_user_message(
    incident_text: str, statutes: list[dict[str, Any]]
) -> str:
    """Render the user-message payload as plain text (no JSON parsing on
    Claude's side — easier to reason about, easier to dump for debugging
    when a section comes back malformed).
    """
    lines: list[str] = [
        "INCIDENT:",
        incident_text.strip(),
        "",
        f"RETRIEVED STATUTES ({len(statutes)}):",
    ]
    for s in statutes:
        lines.append("")
        lines.append(f"--- {s['statute_id']} ({s['universal_citation']}) ---")
        lines.append(s.get("complete_statute") or s.get("statute_text") or "")
    lines.append("")
    lines.append(
        "Produce the 'Related cases & statutes' markdown section as instructed."
    )
    return "\n".join(lines)


def _join_text_blocks(response: Any) -> str:
    """Anthropic SDK responses give content as a list of typed blocks.
    For sub-agents we never expect tool_use blocks (no tools), so we just
    flatten the text. Tests pass plain dicts; tolerate both.
    """
    pieces: list[str] = []
    for block in getattr(response, "content", None) or []:
        if isinstance(block, dict):
            if block.get("type") == "text":
                pieces.append(block.get("text", "") or "")
            continue
        if getattr(block, "type", None) == "text":
            pieces.append(getattr(block, "text", "") or "")
    return "\n".join(p for p in pieces if p)


__all__ = ["SectionResult", "run"]


# Internal helper exposed so the orchestrator can build the same payload
# format consistently across sub-agents (kept private to the package).
def _serialize_statutes(statutes: Iterable[dict[str, Any]]) -> str:
    return json.dumps(list(statutes), ensure_ascii=False, indent=2)
