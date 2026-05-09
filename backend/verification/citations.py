"""Citation extraction for the verification layer.

Parses the assistant's prose answer and yields every statute citation we
can identify, with enough structure for the verifier to match it against
the actual evidence the agent retrieved this turn.

This module is intentionally regex-only — no NLP, no LLM. False negatives
(a real citation we fail to recognize) are acceptable because they just
mean the verifier doesn't audit that claim. False *positives* (calling a
non-citation a citation) are worse — they'd flag perfectly fine prose as
"unsupported". So the patterns are conservative: each one looks for a
jurisdiction-style prefix or a clear `§ N` shape.

Patterns supported:
  - "§ 22350"                        → jurisdiction inferred at match-time
  - "Cal. Veh. Code § 22350(a)"      → jurisdiction = CA
  - "RCW 46.61.502"                  → jurisdiction = WA
  - "Fla. Stat. § 316.183"           → jurisdiction = FL
  - "N.Y. Veh. & Traf. Law § 1192"   → jurisdiction = NY

The extractor de-duplicates jurisdiction-prefixed forms against the bare
"§ N" tail that appears inside them — Claude often writes both, e.g.
"Cal. Veh. Code § 22350(a) ..." which contains a "§ 22350(a)" substring
that should not be counted twice.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


# Jurisdiction-prefixed patterns. Each captures (section_number, subdivision?).
# The `re.IGNORECASE` flag lets us tolerate "cal. veh. code", "Cal Veh Code",
# etc. without exploding the regex with explicit casing alternatives.
_RX_CAL = re.compile(
    r"\bCal\.?\s*Veh\.?\s*Code\s*\u00a7?\s*(\d+)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)
_RX_RCW = re.compile(
    r"\bRCW\s+(\d+\.\d+(?:\.\d+)?)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)
_RX_FLA = re.compile(
    r"\bFla\.?\s*Stat\.?\s*\u00a7?\s*(\d+\.\d+)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)
_RX_NY = re.compile(
    r"\bN\.?Y\.?\s*Veh\.?\s*&?\s*Traf\.?\s*Law\s*\u00a7?\s*(\d+)(?:\(([a-z0-9]+)\))?",
    re.IGNORECASE,
)
# Bare "§ N" — section number plus optional subdivision. Only used to
# catch citations with no explicit jurisdiction prefix; the verifier
# resolves the jurisdiction against the source's own jurisdiction.
#
# Section numbers can be plain ("22350") or dotted ("46.61.502"). The
# inner pattern only allows a "." when it is followed by another digit
# so we don't greedily slurp the sentence-terminating period.
_RX_BARE = re.compile(
    r"\u00a7\s*(\d+(?:\.\d+)*)(?:\(([a-z0-9]+)\))?",
)


@dataclass(frozen=True)
class CitationMention:
    """One citation occurrence in the assistant's answer.

    `raw` is the literal substring from the answer (used to render a chip
    in the UI when we flag the citation as unsupported). `offset` is the
    character position so the frontend can underline in place if it ever
    wants to.

    `jurisdiction` is the explicit jurisdiction code when the citation
    used a prefix (CA/WA/FL/NY). It's None for bare "§ N" mentions —
    the verifier defaults those to the source statute's jurisdiction.

    `section_number` and `subdivision` are normalized for matching.
    Subdivision is None when omitted (citing the whole section).
    """

    raw: str
    offset: int
    jurisdiction: str | None
    section_number: str
    subdivision: str | None


def extract_citations(text: str) -> list[CitationMention]:
    """Walk `text` and return every recognized statute citation.

    Order of return matches order in the source text. Duplicates are
    preserved — the verifier counts mentions when reporting coverage.
    """

    if not text:
        return []

    mentions: list[tuple[int, CitationMention]] = []
    consumed: list[tuple[int, int]] = []

    def add(start: int, end: int, m: CitationMention) -> None:
        mentions.append((start, m))
        consumed.append((start, end))

    for m in _RX_CAL.finditer(text):
        add(
            m.start(),
            m.end(),
            CitationMention(
                raw=text[m.start() : m.end()],
                offset=m.start(),
                jurisdiction="CA",
                section_number=m.group(1),
                subdivision=(m.group(2) or None),
            ),
        )
    for m in _RX_RCW.finditer(text):
        add(
            m.start(),
            m.end(),
            CitationMention(
                raw=text[m.start() : m.end()],
                offset=m.start(),
                jurisdiction="WA",
                section_number=m.group(1),
                subdivision=(m.group(2) or None),
            ),
        )
    for m in _RX_FLA.finditer(text):
        add(
            m.start(),
            m.end(),
            CitationMention(
                raw=text[m.start() : m.end()],
                offset=m.start(),
                jurisdiction="FL",
                section_number=m.group(1),
                subdivision=(m.group(2) or None),
            ),
        )
    for m in _RX_NY.finditer(text):
        add(
            m.start(),
            m.end(),
            CitationMention(
                raw=text[m.start() : m.end()],
                offset=m.start(),
                jurisdiction="NY",
                section_number=m.group(1),
                subdivision=(m.group(2) or None),
            ),
        )

    # Bare "§ N" only counts when it's NOT inside an already-matched
    # jurisdiction prefix (those tails would otherwise double-count).
    for m in _RX_BARE.finditer(text):
        if _inside_any(m.start(), consumed):
            continue
        add(
            m.start(),
            m.end(),
            CitationMention(
                raw=text[m.start() : m.end()],
                offset=m.start(),
                jurisdiction=None,
                section_number=m.group(1),
                subdivision=(m.group(2) or None),
            ),
        )

    mentions.sort(key=lambda pair: pair[0])
    return [m for _, m in mentions]


def _inside_any(pos: int, ranges: list[tuple[int, int]]) -> bool:
    """True if `pos` lies inside any (start, end) span in `ranges`."""
    for start, end in ranges:
        if start <= pos < end:
            return True
    return False
