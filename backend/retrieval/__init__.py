"""Retrieval package — public contract for the API layer and the eval harness.

Exports:

- `StatuteHit` — what `retrieve()` returns.
- `retrieve()` — hybrid-search entry point (citation fast-path + RRF over
  vector + keyword, optional factor + jurisdiction filters).
- `parse_citation()` — turns a free-form citation string into a `statute_id`
  slug, or `None` if the input doesn't look like a recognized citation.
  Supports CA Vehicle Code, FL Statutes, NY V&T Law, WA RCW.
- `make_statute_id()` — deterministic slug builder.

Jurisdiction coverage:
  CA VEH  — California Vehicle Code  (cal. veh. code § NNNNN)
  FL STAT — Florida Statutes Ch 316  (fla. stat. § 316.NNN)
  NY VAT  — NY Vehicle & Traffic Law  (n.y. veh. & traf. law § NNNN)
  WA RCW  — Washington RCW 46.61     (rcw 46.61.NNN)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

__all__ = [
    "StatuteHit",
    "make_statute_id",
    "normalize_subdivision",
    "parse_citation",
    "retrieve",
]


_SUBDIVISION_SEP = re.compile(r"[()&,/\s]+")
_SUBDIVISION_DASH = re.compile(r"-+")

# jurisdiction string → canonical slug
_JURISDICTION_MAP: dict[str, str] = {
    "california": "ca", "ca": "ca",
    "florida": "fl", "fl": "fl",
    "new york": "ny", "newyork": "ny", "ny": "ny",
    "washington": "wa", "wa": "wa",
}

# code_name fragment → canonical slug
# Order matters: more specific patterns must precede shorter ones.
# "traf" catches "Veh. & Traf. Law" before "veh" can steal it.
_CODE_MAP: list[tuple[str, str]] = [
    ("traf", "vat"),          # N.Y. Veh. & Traf. Law
    ("v&t", "vat"),
    ("vat", "vat"),
    ("vehicle and traffic", "vat"),
    ("vehicle & traffic", "vat"),
    ("rcw", "rcw"),
    ("revised code", "rcw"),
    ("stat", "stat"),         # Fla. Stat.
    ("veh", "veh"),           # Cal. Veh. Code — must be last
]


def normalize_subdivision(subdivision: str | None) -> str:
    """Slug-fragment: 'a' → 'a', 'a-b' → 'a-b', '(a)&(c)' → 'a-c'. '' for None."""
    if not subdivision:
        return ""
    s = subdivision.lower().strip()
    s = _SUBDIVISION_SEP.sub("-", s)
    s = _SUBDIVISION_DASH.sub("-", s)
    return s.strip("-")


def make_statute_id(
    jurisdiction: str,
    code_name: str,
    section_number: str,
    subdivision: str | None = None,
) -> str:
    """Build the canonical statute_id slug.

    Slug shape: {jurisdiction}-{code}-{section}[-{subdivision}]
    e.g.: ca-veh-22350, fl-stat-316-183, ny-vat-1180, wa-rcw-46-61-500

    Section decimals are turned into dashes (2800.1 → 2800-1) to satisfy the
    API's ^[a-z0-9-]+$ slug constraint.
    """
    j = jurisdiction.strip().lower()
    jurisdiction_slug = _JURISDICTION_MAP.get(j) or re.sub(r"[^a-z0-9]+", "-", j).strip("-") or "xx"

    code = code_name.strip().lower()
    code_slug = "code"
    for fragment, slug in _CODE_MAP:
        if fragment in code:
            code_slug = slug
            break

    section_slug = re.sub(r"[^a-z0-9]+", "-", section_number.lower()).strip("-")
    sub = normalize_subdivision(subdivision)
    base = f"{jurisdiction_slug}-{code_slug}-{section_slug}"
    return f"{base}-{sub}" if sub else base


# ---------------------------------------------------------------------------
# Per-jurisdiction citation regex patterns
# ---------------------------------------------------------------------------

# California Vehicle Code: "Cal. Veh. Code § 22350(a)", "22350(a)", bare "22350"
_CA_RE = re.compile(
    r"""(?ix)
    (?:cal(?:ifornia)?\.?\s*veh(?:icle)?\.?\s*code\s*)?
    \xa7?\s*
    (?P<section>\d{4,5}(?:\.\d+)?)
    (?:\s*\(\s*(?P<subdivision>[a-z0-9]+)\s*\))?
    """,
)

# Florida Statutes: "Fla. Stat. § 316.183" or bare "316.183"
_FL_RE = re.compile(
    r"""(?ix)
    (?:fla?(?:\.|\s+stat(?:utes?)?)?\.?\s*)?
    \xa7?\s*
    (?P<section>3(?:1[0-9]|0[0-9]|2[0-9])\.\d{1,4})
    (?:\s*\(\s*(?P<subdivision>[a-z0-9]+)\s*\))?
    """,
)

# New York Vehicle & Traffic Law: "N.Y. Veh. & Traf. Law § 1180" or bare "§ 1180"
_NY_RE = re.compile(
    r"""(?ix)
    (?:n\.?y\.?\s*(?:veh(?:icle)?\.?\s*(?:&|and)\s*traf(?:fic)?\.?\s*(?:law)?\s*)?)?
    \xa7?\s*
    (?P<section>1[0-9]{3})
    (?:\s*\(\s*(?P<subdivision>[a-z0-9]+)\s*\))?
    """,
)

# Washington RCW: "RCW 46.61.500" or "Wash. Rev. Code § 46.61.500"
_WA_RE = re.compile(
    r"""(?ix)
    (?:(?:wash(?:ington)?\.?\s*)?rev(?:ised)?\.?\s*code\.?\s*(?:wash\.?)?\s*|rcw\s*)
    \xa7?\s*
    (?P<section>46\.61\.\d{1,3})
    (?:\s*\(\s*(?P<subdivision>[a-z0-9]+)\s*\))?
    """,
)

_CITATION_PARSERS = [
    (_WA_RE,  "WA",         "RCW"),
    (_FL_RE,  "FL",         "Fla. Stat."),
    (_NY_RE,  "NY",         "N.Y. Veh. & Traf. Law"),
    (_CA_RE,  "California", "Cal. Veh. Code"),
]


def parse_citation(text: str) -> str | None:
    """Extract a statute_id slug from free-form citation text.

    Tries CA, FL, NY, WA patterns in order. Returns None if no pattern matches.
    Only the first match per pattern is used.
    """
    if not text:
        return None
    for pattern, jurisdiction, code_name in _CITATION_PARSERS:
        m = pattern.search(text)
        if m:
            section = m.group("section")
            if not section:
                continue
            subdivision = m.group("subdivision") if "subdivision" in pattern.groupindex else None
            return make_statute_id(
                jurisdiction=jurisdiction,
                code_name=code_name,
                section_number=section,
                subdivision=subdivision,
            )
    return None


@dataclass
class StatuteHit:
    """One retrieved statute with its rank score."""

    statute_id: str
    universal_citation: str
    jurisdiction: str
    code_name: str
    section_number: str
    subdivision: str | None
    division: str | None
    chapter: str | None
    statute_text: str
    complete_statute: str
    official_url: str
    score: float
    factors: list[str] = field(default_factory=list)
    matched_via: str = "hybrid"


def retrieve(
    query: str,
    factor: str | None = None,
    jurisdiction: str | None = None,
    top_k: int = 10,
) -> list[StatuteHit]:
    """Hybrid retrieval over all indexed statutes.

    Lazy import keeps `from backend.retrieval import StatuteHit` cheap.
    """
    from backend.retrieval.hybrid_search import retrieve as _retrieve

    return _retrieve(query=query, factor=factor, jurisdiction=jurisdiction, top_k=top_k)
