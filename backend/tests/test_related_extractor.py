"""Pure-Python unit tests for the citation-extractor used by
`GET /statutes/{slug}/related`.

These tests intentionally don't import the full FastAPI app or touch the
DB — they only exercise the regex-driven extractor so they're cheap and
runnable in any environment, including ones without `chromadb` installed.

Run with:
    python -m unittest backend.tests.test_related_extractor
"""

from __future__ import annotations

import unittest

from backend.api.routes_statutes import _extract_citation_candidates


class TestExtractCitationCandidates(unittest.TestCase):
    def test_bare_section_marker_uses_source_jurisdiction(self) -> None:
        text = "See § 23153(a) for the felony version of this statute."
        out = _extract_citation_candidates(text, "CA")
        self.assertEqual(out, {("CA", "23153"): 1})

    def test_jurisdiction_prefixed_overrides_source(self) -> None:
        # Source is CA but the text references a Washington statute
        # explicitly via RCW. The candidate should come back with WA.
        text = "Compare RCW 46.61.500 to the California reckless driving law."
        out = _extract_citation_candidates(text, "CA")
        self.assertIn(("WA", "46.61.500"), out)

    def test_florida_and_california_in_same_text(self) -> None:
        text = (
            "Cal. Veh. Code § 23103(a) parallels Fla. Stat. § 316.192 and "
            "RCW 46.61.500 in its mens-rea formulation."
        )
        out = _extract_citation_candidates(text, "CA")
        self.assertIn(("CA", "23103"), out)
        self.assertIn(("FL", "316.192"), out)
        self.assertIn(("WA", "46.61.500"), out)

    def test_repeated_reference_increments_mention_count(self) -> None:
        text = (
            "§ 23103(a) defines reckless driving. § 23103(b) addresses the "
            "same conduct in off-street parking facilities. See § 23103."
        )
        out = _extract_citation_candidates(text, "CA")
        # Three references to base section 23103 (subdivisions are dropped
        # from the key on purpose so the graph shows the parent section).
        self.assertEqual(out.get(("CA", "23103")), 3)

    def test_explicit_prefix_does_not_double_count_via_bare_tail(self) -> None:
        # Without the offset-dedupe, the bare-§-pattern would also match
        # the trailing "§ 23103(a)" inside "Cal. Veh. Code § 23103(a)" and
        # bump the count to 2. We expect exactly 1.
        text = "Cal. Veh. Code § 23103(a) governs reckless driving."
        out = _extract_citation_candidates(text, "WA")
        self.assertEqual(out.get(("CA", "23103")), 1)
        self.assertNotIn(("WA", "23103"), out)

    def test_empty_text_returns_empty_dict(self) -> None:
        self.assertEqual(_extract_citation_candidates("", "CA"), {})


if __name__ == "__main__":
    unittest.main()
