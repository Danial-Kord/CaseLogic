"""Helpers for the embedding side of retrieval.

We don't wrap an embedding model here — Chroma owns the embedding call via its
default `all-MiniLM-L6-v2` function. The only thing we control is *what string
goes in*, which is where the deterministic Anthropic-style contextual prefix
lives. Keeping it deterministic (vs LLM-generated) means re-indexing is free,
trace-able, and doesn't burn API budget.
"""

from __future__ import annotations

from backend.models import Statute


def make_contextual_text(statute: Statute) -> str:
    """Prefix + body string fed into the vector index for one statute.

    Format: `<code> § <section><(subdivision)> [<division>; <chapter>]. <body>`

    The prefix gives the embedder enough context to disambiguate near-identical
    statute text — e.g. all yielding statutes look similar, but the division /
    chapter context lets the vector model separate "yield at intersection"
    from "yield to pedestrians".
    """

    section_label = statute.section_number
    if statute.subdivision:
        section_label = f"{section_label}({statute.subdivision})"

    location_parts = [p for p in (statute.division, statute.chapter) if p]
    location_clause = f" [{'; '.join(location_parts)}]" if location_parts else ""

    body = statute.complete_statute or statute.statute_text or ""
    return f"{statute.code_name} \u00a7 {section_label}{location_clause}. {body}".strip()
