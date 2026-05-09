"""Pure-Python tests for the verification layer.

No DB, no FastAPI client — just the regex extractors and the verifier
function. Runs in <1 second so it's safe to include in the default
unittest discovery loop.
"""

from __future__ import annotations

import unittest

from backend.verification import Evidence, verify_turn
from backend.verification.citations import extract_citations
from backend.verification.claims import extract_quotes


# -------------------------------------------------------- citation extractor


class CitationExtractorTests(unittest.TestCase):
    def test_explicit_california_citation(self) -> None:
        text = "Per Cal. Veh. Code \u00a7 22350(a), the basic speed law applies."
        cites = extract_citations(text)

        self.assertEqual(len(cites), 1)
        self.assertEqual(cites[0].jurisdiction, "CA")
        self.assertEqual(cites[0].section_number, "22350")
        self.assertEqual(cites[0].subdivision, "a")

    def test_bare_section_inherits_default_jurisdiction(self) -> None:
        text = "See \u00a7 22107 for lane-change rules."
        cites = extract_citations(text)

        self.assertEqual(len(cites), 1)
        self.assertIsNone(cites[0].jurisdiction)
        self.assertEqual(cites[0].section_number, "22107")

    def test_jurisdiction_prefix_does_not_double_count_tail(self) -> None:
        # The "\u00a7 22350(a)" tail inside "Cal. Veh. Code \u00a7 22350(a)"
        # must not produce a second bare-mention. The verifier counts each
        # citation once.
        text = "Cal. Veh. Code \u00a7 22350(a) and also \u00a7 22107."
        cites = extract_citations(text)

        self.assertEqual(len(cites), 2)
        self.assertEqual(cites[0].jurisdiction, "CA")
        self.assertEqual(cites[0].section_number, "22350")
        self.assertIsNone(cites[1].jurisdiction)
        self.assertEqual(cites[1].section_number, "22107")

    def test_multiple_jurisdictions(self) -> None:
        text = (
            "RCW 46.61.502 and Fla. Stat. \u00a7 316.193 and N.Y. Veh. & "
            "Traf. Law \u00a7 1192."
        )
        cites = extract_citations(text)

        juris = [c.jurisdiction for c in cites]
        self.assertIn("WA", juris)
        self.assertIn("FL", juris)
        self.assertIn("NY", juris)


# ----------------------------------------------------------- quote extractor


class QuoteExtractorTests(unittest.TestCase):
    def test_double_quoted_long_span(self) -> None:
        text = (
            'The statute states "a person shall not drive at a speed greater '
            'than is reasonable" under any condition.'
        )
        spans = extract_quotes(text)

        self.assertEqual(len(spans), 1)
        self.assertEqual(spans[0].kind, "double")
        self.assertIn("reasonable", spans[0].text)

    def test_short_quoted_phrases_are_skipped(self) -> None:
        text = 'The driver said "yes" but did not stop.'
        self.assertEqual(extract_quotes(text), [])

    def test_blockquote_recognized(self) -> None:
        text = (
            "Quoting the statute:\n\n"
            "> A driver facing a steady circular red signal alone shall stop "
            "at a marked limit line.\n\n"
            "This is the rule."
        )
        spans = extract_quotes(text)

        self.assertEqual(len(spans), 1)
        self.assertEqual(spans[0].kind, "blockquote")
        self.assertIn("marked limit line", spans[0].text)


# --------------------------------------------------------- verify_turn (e2e)


def _ev_statute(
    *,
    section: str,
    jurisdiction: str = "CA",
    text: str,
    citation: str = "",
    slug: str = "",
) -> Evidence:
    return Evidence(
        kind="statute",
        text=text,
        statute_id=slug or f"ca-veh-{section}",
        universal_citation=citation or f"Cal. Veh. Code \u00a7 {section}",
        section_number=section,
        jurisdiction=jurisdiction,
    )


class VerifyTurnTests(unittest.TestCase):
    def test_clean_when_every_citation_and_quote_supported(self) -> None:
        evidence = [
            _ev_statute(
                section="22350",
                text=(
                    "No person shall drive a vehicle upon a highway at a "
                    "speed greater than is reasonable or prudent having due "
                    "regard for weather, visibility, and the traffic on the "
                    "highway."
                ),
            )
        ]
        answer = (
            "Cal. Veh. Code \u00a7 22350 codifies the basic speed law. The "
            "statute states \"No person shall drive a vehicle upon a highway "
            "at a speed greater than is reasonable or prudent\" under any "
            "condition."
        )

        report = verify_turn(answer, evidence)

        self.assertEqual(report.status, "clean")
        self.assertEqual(report.citations_total, 1)
        self.assertEqual(report.citations_supported, 1)
        self.assertEqual(report.quotes_total, 1)
        self.assertEqual(report.quotes_supported, 1)
        self.assertEqual(report.unsupported_citations, [])
        self.assertEqual(report.unsupported_quotes, [])

    def test_unsupported_citation_is_flagged(self) -> None:
        evidence = [_ev_statute(section="22350", text="basic speed law text")]
        # Cite a section the agent never retrieved.
        answer = "Cal. Veh. Code \u00a7 99999 says you must always slow down."

        report = verify_turn(answer, evidence)

        self.assertEqual(report.status, "unsupported")
        self.assertEqual(report.citations_total, 1)
        self.assertEqual(report.citations_supported, 0)
        self.assertEqual(len(report.unsupported_citations), 1)
        self.assertEqual(report.unsupported_citations[0].section_number, "99999")
        self.assertEqual(report.unsupported_citations[0].jurisdiction, "CA")

    def test_unsupported_quote_is_flagged(self) -> None:
        evidence = [
            _ev_statute(
                section="22350",
                text="real text that makes no mention of penguins",
            )
        ]
        answer = (
            "The court held \"every driver must yield to penguins on the "
            "highway, no exceptions.\""
        )

        report = verify_turn(answer, evidence)

        self.assertEqual(report.status, "unsupported")
        self.assertEqual(report.quotes_total, 1)
        self.assertEqual(report.quotes_supported, 0)
        self.assertEqual(len(report.unsupported_quotes), 1)
        self.assertIn("penguins", report.unsupported_quotes[0].text)

    def test_subdivision_mismatch_is_still_supported(self) -> None:
        # Citing § 22350(a) when the agent retrieved bare § 22350 is fine —
        # the lawyer can verify the subdivision against the surfaced full
        # text. We only flag completely-missing sections.
        evidence = [_ev_statute(section="22350", text="basic speed law text")]
        answer = "Cal. Veh. Code \u00a7 22350(a) governs reasonable speed."

        report = verify_turn(answer, evidence)

        self.assertEqual(report.status, "clean")
        self.assertEqual(report.citations_supported, 1)

    def test_skipped_when_no_citations_or_quotes(self) -> None:
        evidence = [_ev_statute(section="22350", text="text")]
        answer = "I don't have a clear answer for this question yet."

        report = verify_turn(answer, evidence)

        self.assertEqual(report.status, "skipped")
        self.assertEqual(report.citations_total, 0)
        self.assertEqual(report.quotes_total, 0)

    def test_jurisdiction_disagreement_marks_unsupported(self) -> None:
        # Agent retrieved a CA statute but the answer cited an RCW
        # (Washington) section with the same number — wrong jurisdiction,
        # must flag.
        evidence = [_ev_statute(section="46.61.502", jurisdiction="CA", text="x")]
        answer = "RCW 46.61.502 governs the situation."

        report = verify_turn(answer, evidence)

        self.assertEqual(report.status, "unsupported")
        self.assertEqual(len(report.unsupported_citations), 1)
        self.assertEqual(report.unsupported_citations[0].jurisdiction, "WA")


if __name__ == "__main__":
    unittest.main()
