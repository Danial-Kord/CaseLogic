"""Citation + quote verifier.

This is the deterministic half of the "source-grounded answers" guarantee
the brief calls out (§9 of the baseline architecture, plus failure mode 2:
"answer reads well but judges can't verify"). The agent loop calls
`verify_turn(answer_text, evidence)` after Claude has drafted the final
answer. The result is attached to the assistant turn so the frontend can:

  - Show a green "verified" badge when every citation and every quoted
    span maps to a piece of retrieved evidence.
  - Show an amber "needs review" badge with the specific unsupported
    citations / quotes called out, so the lawyer knows exactly which
    claims to spot-check before relying on them.

Important: this layer flags, it never rewrites. CLAUDE.md is explicit on
this — silently dropping unsupported claims would be worse than showing
them with a warning, because a lawyer skimming a clean-looking answer
would have no idea anything was uncertain.

Scope (deliberate):
  - We verify *direct* citations (regex-matched section numbers).
  - We verify *direct* quotations (text wrapped in quote marks or block
    quotes).
  - We do NOT try to verify paraphrased claims — that needs an LLM judge,
    which would be its own roundtrip; the team will add that as a later
    phase if there's time.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, Literal

from backend.verification.citations import CitationMention, extract_citations
from backend.verification.claims import (
    MIN_QUOTE_CHARS,
    QuotedSpan,
    extract_quotes,
    normalize_for_match,
)


# ---------------------------------------------------------------- evidence


@dataclass
class Evidence:
    """One source the assistant could legitimately cite or quote from.

    Built in the agent loop from the union of statute hits + web hits the
    tools returned this turn. Verifier matches answer text against this
    set; anything outside the set is "unsupported".

    Statute evidence carries enough metadata that we can match a bare
    "§ N" mention against it without needing the prose to spell out
    "Cal. Veh. Code §". Web evidence carries only `text`/`url` because
    we don't try to extract canonical citations from arbitrary web pages.
    """

    kind: Literal["statute", "web"]
    text: str
    display_url: str | None = None
    statute_id: str | None = None
    universal_citation: str | None = None
    section_number: str | None = None
    jurisdiction: str | None = None


# ----------------------------------------------------------------- report


@dataclass
class UnsupportedCitation:
    """A citation the assistant emitted that doesn't map to any evidence.

    `text` is the literal form from the answer (not normalized) so the UI
    can show it back to the user. `reason` is a short human-readable
    string suitable for a tooltip.
    """

    text: str
    offset: int
    section_number: str
    jurisdiction: str | None
    reason: str


@dataclass
class UnsupportedQuote:
    """A quoted span we couldn't find verbatim in any evidence text."""

    text: str
    offset: int
    kind: str
    reason: str


@dataclass
class VerificationReport:
    """Outcome of one turn's verification pass.

    Counters give the UI enough information to render coverage stats
    ("3 / 4 citations supported"). The `unsupported_*` lists drive the
    detail pop-out. `status` is the headline.
    """

    status: Literal["clean", "unsupported", "skipped"]
    citations_total: int = 0
    citations_supported: int = 0
    quotes_total: int = 0
    quotes_supported: int = 0
    unsupported_citations: list[UnsupportedCitation] = field(default_factory=list)
    unsupported_quotes: list[UnsupportedQuote] = field(default_factory=list)
    # Diagnostic-only — not user-facing. Useful when debugging why a
    # turn was marked clean (or not) without re-running.
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """JSON-serializable form. Nested dataclasses go through asdict."""
        return {
            "status": self.status,
            "citations_total": self.citations_total,
            "citations_supported": self.citations_supported,
            "quotes_total": self.quotes_total,
            "quotes_supported": self.quotes_supported,
            "unsupported_citations": [asdict(c) for c in self.unsupported_citations],
            "unsupported_quotes": [asdict(q) for q in self.unsupported_quotes],
            "notes": list(self.notes),
        }


# ------------------------------------------------------------- public API


def verify_turn(
    answer_text: str,
    evidence: Iterable[Evidence],
    *,
    default_jurisdiction: str | None = "CA",
) -> VerificationReport:
    """Run the verification pass against `answer_text`.

    `evidence` is whatever the agent retrieved this turn — already
    deduped, with full body text loaded so we can substring-match
    quotes against the actual statute text (not just snippets).

    `default_jurisdiction` resolves bare "§ N" citations to a specific
    jurisdiction. Phase 1 is California-only, so CA is the right default;
    callers can override per-turn if the conversation is rooted somewhere
    else.

    Returns a `VerificationReport`. The report is `status="skipped"`
    only when there's literally nothing to check — empty answer, or no
    citations + no quotes — so the UI can render a neutral chip instead
    of green-flagging a blank turn.
    """

    answer_text = (answer_text or "").strip()
    if not answer_text:
        return VerificationReport(status="skipped", notes=["empty answer"])

    evidence_list = list(evidence)

    citations = extract_citations(answer_text)
    quotes = extract_quotes(answer_text)

    if not citations and not quotes:
        return VerificationReport(
            status="skipped",
            notes=["no citations or quotations extracted"],
        )

    cited = _verify_citations(citations, evidence_list, default_jurisdiction)
    quoted = _verify_quotes(quotes, evidence_list)

    status: Literal["clean", "unsupported"]
    if cited["unsupported"] or quoted["unsupported"]:
        status = "unsupported"
    else:
        status = "clean"

    return VerificationReport(
        status=status,
        citations_total=cited["total"],
        citations_supported=cited["supported"],
        quotes_total=quoted["total"],
        quotes_supported=quoted["supported"],
        unsupported_citations=cited["unsupported"],
        unsupported_quotes=quoted["unsupported"],
    )


# ------------------------------------------------------------- internals


def _verify_citations(
    citations: list[CitationMention],
    evidence: list[Evidence],
    default_jurisdiction: str | None,
) -> dict[str, Any]:
    statute_evidence = [e for e in evidence if e.kind == "statute"]

    supported = 0
    unsupported: list[UnsupportedCitation] = []

    for c in citations:
        juris = c.jurisdiction or default_jurisdiction
        if _is_citation_supported(c, juris, statute_evidence):
            supported += 1
            continue
        unsupported.append(
            UnsupportedCitation(
                text=c.raw,
                offset=c.offset,
                section_number=c.section_number,
                jurisdiction=juris,
                reason=(
                    "Citation does not match any statute the agent retrieved "
                    "this turn."
                ),
            )
        )

    return {
        "total": len(citations),
        "supported": supported,
        "unsupported": unsupported,
    }


def _is_citation_supported(
    citation: CitationMention,
    resolved_jurisdiction: str | None,
    statute_evidence: list[Evidence],
) -> bool:
    """A citation is supported if any retrieved statute matches its
    `(jurisdiction, section_number)` pair.

    Subdivision is intentionally NOT required to match — citing
    "§ 22350(a)" when the agent retrieved bare § 22350 is fine, because
    the lawyer can verify the subdivision against the surfaced full text.
    Citing a section the agent never pulled, on the other hand, is the
    classic hallucination we're trying to catch.
    """

    target_section = citation.section_number.strip().rstrip(".")
    if not target_section:
        return False

    for ev in statute_evidence:
        if ev.section_number is None:
            continue
        if ev.section_number != target_section:
            continue
        # Section matches. If the citation specified a jurisdiction (or
        # we resolved one via the default), the evidence must agree.
        if resolved_jurisdiction is None:
            return True
        if ev.jurisdiction is None:
            # No jurisdiction tag on the evidence — give it the benefit
            # of the doubt (older rows may have empty jurisdiction).
            return True
        if ev.jurisdiction.upper() == resolved_jurisdiction.upper():
            return True
    return False


def _verify_quotes(
    quotes: list[QuotedSpan],
    evidence: list[Evidence],
) -> dict[str, Any]:
    # Pre-normalize evidence text once — quotes are typically <100 chars
    # so we'll do many substring searches against the same haystacks.
    haystacks: list[str] = [normalize_for_match(e.text) for e in evidence if e.text]

    supported = 0
    unsupported: list[UnsupportedQuote] = []

    for q in quotes:
        needle = normalize_for_match(q.text)
        if len(needle) < MIN_QUOTE_CHARS:
            # Quote was long enough before normalization but collapsed
            # below the threshold — treat as too short to audit, not
            # as unsupported. (e.g. a stretch of whitespace.)
            continue
        if any(needle in h for h in haystacks):
            supported += 1
            continue
        unsupported.append(
            UnsupportedQuote(
                text=q.text,
                offset=q.offset,
                kind=q.kind,
                reason=(
                    "Quoted text does not appear verbatim in any retrieved "
                    "source. Confirm the wording before relying on it."
                ),
            )
        )

    return {
        "total": len(quotes),
        "supported": supported,
        "unsupported": unsupported,
    }
