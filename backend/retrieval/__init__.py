"""Retrieval package — public contract for the API layer and the eval harness.

Exports:

- `StatuteHit` — what `retrieve()` returns. The API's `StatuteHitOut` Pydantic
  model in `backend.api.schemas` mirrors this 1:1 so routes are thin.
- `retrieve()` — the hybrid-search entry point (citation fast-path + RRF over
  vector + keyword, optional factor filter).
- `parse_citation()` — turns a free-form citation string into a `statute_id`
  slug, or `None` if the input doesn't look like a citation. Used by both the
  retrieve fast-path and any tooling that needs the same canonicalization.
- `make_statute_id()` — deterministic slug builder (jurisdiction + code +
  section + subdivision). Person 1 calls this at ingest time; we expose it
  here so the eval harness uses the same code path.

`CITATION_REGEX` covers the common forms: `Cal. Veh. Code § 22350`,
`22350(a)`, bare `22350`. Multi-subdivision forms like `21453(a)-(b)` are
not parsed here — they fall through to keyword search, which still finds
them via the FTS5 index over `universal_citation`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

__all__ = [
    "CITATION_REGEX",
    "StatuteHit",
    "make_statute_id",
    "normalize_subdivision",
    "parse_citation",
    "retrieve",
]


CITATION_REGEX = re.compile(
    r"""(?ix)
    (?:cal(?:ifornia)?\.?\s*veh(?:icle)?\.?\s*code\s*)?   # optional code prefix
    \xa7?\s*                                              # optional section sign
    (?P<section>\d+(?:\.\d+)?)                            # section number, e.g. 22350 or 22100.5
    (?:\s*\(\s*(?P<subdivision>[a-z0-9]+)\s*\))?          # optional single subdivision
    """
)


_SUBDIVISION_SEP = re.compile(r"[()&,/\s]+")
_SUBDIVISION_DASH = re.compile(r"-+")


def normalize_subdivision(subdivision: str | None) -> str:
    """Slug-fragment from raw subdivision text: 'a' → 'a', 'a-b' → 'a-b',
    '(a)&(c)' → 'a-c'. Returns '' for None/empty input."""

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
    """Build the canonical `statute_id` slug.

    Phase 1 only handles California Vehicle Code; the slug shape is
    `ca-veh-{section}` or `ca-veh-{section}-{subdivision}`. When more
    jurisdictions land in Phase 2 we'll extend the mapping.
    """

    j = jurisdiction.strip().lower()
    if j in {"california", "ca"}:
        jurisdiction_slug = "ca"
    else:
        jurisdiction_slug = re.sub(r"[^a-z0-9]+", "-", j).strip("-") or "xx"

    code = code_name.strip().lower()
    if "veh" in code:
        code_slug = "veh"
    else:
        code_slug = re.sub(r"[^a-z0-9]+", "-", code).strip("-") or "code"

    sub = normalize_subdivision(subdivision)
    base = f"{jurisdiction_slug}-{code_slug}-{section_number}"
    return f"{base}-{sub}" if sub else base


def parse_citation(text: str) -> str | None:
    """Try to extract a `statute_id` slug from free-form citation text.

    Returns `None` if the input doesn't look like a CA Vehicle Code citation.
    Only the first match is used — multi-subdivision strings like
    `21453(a)-(b)` resolve to `ca-veh-21453-a` and intentionally miss the
    multi-subdivision row, which keyword search will pick up instead.
    """

    if not text:
        return None
    match = CITATION_REGEX.search(text)
    if not match:
        return None
    section = match.group("section")
    if not section:
        return None
    subdivision = match.group("subdivision")
    return make_statute_id(
        jurisdiction="California",
        code_name="Cal. Veh. Code",
        section_number=section,
        subdivision=subdivision,
    )


@dataclass
class StatuteHit:
    """One retrieved statute with its rank score. Mirrors the API's
    `StatuteHitOut` shape so `routes_statutes.py` is a thin pass-through."""

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
    top_k: int = 10,
) -> list[StatuteHit]:
    """Hybrid retrieval over CA Vehicle Code statutes.

    Lazy import of the implementation keeps `from backend.retrieval import
    StatuteHit` cheap (no Chroma boot) for code paths that just want the
    types — important for the API layer's startup time.
    """

    from backend.retrieval.hybrid_search import retrieve as _retrieve

    return _retrieve(query=query, factor=factor, top_k=top_k)
