"""Contacts sub-agent — roles only, never named individuals.

Same shape as `sub_cases`: one Claude call, no tools, markdown output.
The hard "no named individuals" rule is enforced via the system prompt
plus a post-hoc safety check that rejects obvious name patterns.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from backend.planning.prompts import SYSTEM_CONTACTS
from backend.planning.sub_cases import SectionResult, _join_text_blocks


# Conservative "looks like a person's name" pattern: two consecutive
# capitalized words. Matches "John Smith" but not "California Highway
# Patrol". False positives (e.g. "Vehicle Code") are dropped via the
# allowlist; false negatives (single-name aliases) are acceptable since
# the prompt is the primary enforcement mechanism.
_NAME_RE = re.compile(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\b")
_NAME_ALLOWLIST = {
    "California Highway",
    "Highway Patrol",
    "Vehicle Code",
    "Civil Code",
    "Penal Code",
    "Insurance Commissioner",
    "Attorney General",
    "District Attorney",
    "Public Records",
    "Workers Compensation",
    "Department Motor",
    "Motor Vehicles",
    "United States",
    "State Bar",
    "Superior Court",
    "Court Clerk",
    "Medical Board",
    "Health Records",
    "Insurance Carrier",
    "Defense Counsel",
    "Plaintiff Counsel",
}


def run(
    *,
    client: Any,
    model: str,
    incident_text: str,
    statutes: Iterable[dict[str, Any]],
    max_tokens: int = 1200,
) -> SectionResult:
    """Run the contacts sub-agent.

    Behavior is identical to the cases sub-agent except for the system
    prompt and a defensive scrub on the model's output.
    """

    statutes_list = list(statutes)
    user_payload = _build_user_message(incident_text, statutes_list)

    response = client.messages.create(
        model=model,
        system=SYSTEM_CONTACTS,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": user_payload}],
    )
    content_md = _scrub_named_individuals(_join_text_blocks(response).strip())
    return SectionResult(content_md=content_md)


def _build_user_message(
    incident_text: str, statutes: list[dict[str, Any]]
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
    lines.append(
        "Produce the 'People to reach out to' markdown section as instructed. "
        "Roles only \u2014 never name individuals."
    )
    return "\n".join(lines)


def _scrub_named_individuals(content: str) -> str:
    """Belt-and-suspenders: redact obvious "First Last" name patterns the
    prompt should already have prevented. We replace each occurrence
    with `[redacted name]` so the structure of the section stays intact
    and the redaction is visible to the user (rather than silently
    dropping content).
    """

    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        if token in _NAME_ALLOWLIST:
            return token
        return "[redacted name]"

    return _NAME_RE.sub(replace, content)


__all__ = ["run"]
