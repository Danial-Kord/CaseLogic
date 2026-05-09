"""Brief drafter sub-agent.

Consumes the previous two sub-agents' outputs (cases markdown + contacts
markdown) plus the retrieved statutes, and produces a markdown brief
outline an attorney could adapt into an actual filing.
"""

from __future__ import annotations

from typing import Any, Iterable

from backend.planning.prompts import SYSTEM_BRIEF
from backend.planning.sub_cases import SectionResult, _join_text_blocks


def run(
    *,
    client: Any,
    model: str,
    incident_text: str,
    statutes: Iterable[dict[str, Any]],
    cases_md: str,
    contacts_md: str,
    max_tokens: int = 2000,
) -> SectionResult:
    """Run the brief drafter and return the markdown."""

    statutes_list = list(statutes)
    user_payload = _build_user_message(
        incident_text, statutes_list, cases_md, contacts_md
    )

    response = client.messages.create(
        model=model,
        system=SYSTEM_BRIEF,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": user_payload}],
    )
    return SectionResult(content_md=_join_text_blocks(response).strip())


def _build_user_message(
    incident_text: str,
    statutes: list[dict[str, Any]],
    cases_md: str,
    contacts_md: str,
) -> str:
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
    lines.append("PRIOR SECTION \u2014 RELATED CASES & STATUTES:")
    lines.append(cases_md or "(none)")
    lines.append("")
    lines.append("PRIOR SECTION \u2014 PEOPLE TO REACH OUT TO:")
    lines.append(contacts_md or "(none)")
    lines.append("")
    lines.append(
        "Produce the 'Recommended brief outline' markdown section as instructed. "
        "Bracketed placeholders for any party / court / number you don't have."
    )
    return "\n".join(lines)


__all__ = ["run"]
