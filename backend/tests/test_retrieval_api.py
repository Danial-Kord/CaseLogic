"""Smoke test for the Phase-1 retrieval + API slice.

Run with either:

    python -m unittest backend.tests.test_retrieval_api
    python -m backend.tests.test_retrieval_api

Seeds 7 California Vehicle Code statutes drawn from `eval-ca-vehicle-code.csv`,
builds FTS5 + Chroma indices, and asserts the four endpoints behave per
[docs/api.md](../../docs/api.md). Intentionally small — Person 6 owns the full
eval harness that runs against all 41 released CSV rows.

First run downloads Chroma's default embedding model (~80 MB) to the local
HuggingFace cache. Subsequent runs are sub-second.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path


def _bind_temp_paths_before_import() -> Path:
    """Set DATABASE_URL + VECTOR_INDEX_PATH to a fresh temp dir.

    Must run before any `backend.*` import: `backend.db` reads the engine URL
    once at module import time. `python-dotenv` won't override env vars we
    pre-set, so this is safe even when `.env` is present.
    """

    tmp_root = Path(tempfile.mkdtemp(prefix="caselogic-smoke-"))
    db_path = tmp_root / "test.db"
    index_path = tmp_root / "index"
    index_path.mkdir(parents=True, exist_ok=True)
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ["VECTOR_INDEX_PATH"] = str(index_path)
    return tmp_root


_TMP_ROOT = _bind_temp_paths_before_import()


from fastapi.testclient import TestClient  # noqa: E402

from backend.db import get_session, init_db  # noqa: E402
from backend.extraction.factors import FACTORS  # noqa: E402
from backend.main import app  # noqa: E402
from backend.models import Statute, StatuteFactor  # noqa: E402
from backend.retrieval import make_statute_id, parse_citation  # noqa: E402
from backend.retrieval.keyword_search import rebuild_fts  # noqa: E402
from backend.retrieval.vector_store import reset_collection, upsert_statutes  # noqa: E402


SEED_STATUTES: list[dict] = [
    {
        "section": "22350",
        "subdivision": None,
        "citation": "Cal. Veh. Code § 22350",
        "text": (
            "[N]o person shall drive a vehicle upon a highway at a speed greater than is "
            "reasonable or prudent having due regard for weather, visibility, the traffic "
            "on, and the surface and width of, the highway, and in no event at a speed "
            "which endangers the safety of persons or property."
        ),
        "factor": "Driving Too Fast For Conditions",
    },
    {
        "section": "23103",
        "subdivision": "a",
        "citation": "Cal. Veh. Code § 23103(a)",
        "text": (
            "A person who drives a vehicle upon a highway in willful or wanton disregard "
            "for the safety of persons or property is guilty of reckless driving."
        ),
        "factor": "Reckless Driving",
    },
    {
        "section": "21453",
        "subdivision": "a",
        "citation": "Cal. Veh. Code § 21453(a)",
        "text": (
            "A driver facing a steady circular red signal alone shall stop at a marked "
            "limit line, but if none, before entering the crosswalk on the near side of "
            "the intersection, and shall remain stopped until an indication to proceed is "
            "shown, except as provided in subdivision (b)."
        ),
        "factor": "Failure to Obey Traffic Control Device",
    },
    {
        "section": "23152",
        "subdivision": "a",
        "citation": "Cal. Veh. Code § 23152(a)",
        "text": "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
        "factor": "DUI/DWI",
    },
    {
        "section": "21750",
        "subdivision": "a",
        "citation": "Cal. Veh. Code § 21750(a)",
        "text": (
            "The driver of a vehicle overtaking another vehicle proceeding in the same "
            "direction shall pass to the left at a safe distance without interfering with "
            "the safe operation of the overtaken vehicle."
        ),
        "factor": "Improper Passing",
    },
    {
        "section": "21751",
        "subdivision": None,
        "citation": "Cal. Veh. Code § 21751",
        "text": (
            "On a two-lane highway, no vehicle shall be driven to the left side of the "
            "center of the roadway in overtaking and passing another vehicle proceeding in "
            "the same direction unless the left side is clearly visible."
        ),
        "factor": "Improper Passing",
    },
    {
        "section": "23123",
        "subdivision": "a",
        "citation": "Cal. Veh. Code § 23123(a)",
        "text": (
            "A person shall not drive a motor vehicle while using a wireless telephone "
            "unless that telephone is specifically designed and configured to allow "
            "hands-free listening and talking, and is used in that manner while driving."
        ),
        "factor": "Using a Wireless Telephone/Texting While Driving",
    },
]


def _seed_database() -> None:
    """Populate `statutes` + `statute_factors` with the seed corpus."""

    init_db()
    with get_session() as session:
        for row in SEED_STATUTES:
            statute_id = make_statute_id(
                jurisdiction="California",
                code_name="Cal. Veh. Code",
                section_number=row["section"],
                subdivision=row["subdivision"],
            )
            statute = Statute(
                statute_id=statute_id,
                jurisdiction="California",
                code_name="Cal. Veh. Code",
                section_number=row["section"],
                universal_citation=row["citation"],
                subdivision=row["subdivision"],
                division="Division 11",
                chapter=None,
                statute_text=row["text"],
                complete_statute=f"Pursuant to {row['citation']}, {row['text']}",
                official_url=(
                    "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml"
                    f"?lawCode=VEH&sectionNum={row['section']}"
                ),
            )
            statute.factors.append(
                StatuteFactor(
                    factor=row["factor"],
                    confidence=0.9,
                    quote=row["text"][:120],
                )
            )
            session.add(statute)


def _build_indices() -> None:
    reset_collection()
    with get_session() as session:
        statutes = list(session.query(Statute).all())
        upsert_statutes(statutes)
        rebuild_fts(session)


class RetrievalAndApiSmoke(unittest.TestCase):
    """End-to-end smoke test: seed → index → exercise all four endpoints."""

    @classmethod
    def setUpClass(cls) -> None:
        _seed_database()
        _build_indices()
        cls.client_cm = TestClient(app)
        cls.client = cls.client_cm.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_cm.__exit__(None, None, None)
        shutil.rmtree(_TMP_ROOT, ignore_errors=True)

    # ---------------------------------------------------------- pure helpers

    def test_parse_citation_round_trips(self) -> None:
        cases = {
            "Cal. Veh. Code § 22350": "ca-veh-22350",
            "cal veh code 22350": "ca-veh-22350",
            "Cal. Veh. Code § 23103(a)": "ca-veh-23103-a",
            "23123(a)": "ca-veh-23123-a",
            "23152(A)": "ca-veh-23152-a",
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(parse_citation(text), expected)

    def test_parse_citation_returns_none_for_garbage(self) -> None:
        for text in ["", "   ", "not a citation", "abc def"]:
            with self.subTest(text=text):
                self.assertIsNone(parse_citation(text))

    # ------------------------------------------------------------- /factors

    def test_factors_endpoint_returns_all_seventeen(self) -> None:
        response = self.client.get("/factors")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        names = [entry["factor"] for entry in body["factors"]]
        self.assertEqual(len(names), 17)
        self.assertEqual(names, sorted(names))
        self.assertEqual(set(names), set(FACTORS))

    def test_factors_counts_match_seed(self) -> None:
        body = self.client.get("/factors").json()
        counts = {entry["factor"]: entry["statute_count"] for entry in body["factors"]}
        self.assertEqual(counts["Improper Passing"], 2)
        self.assertEqual(counts["DUI/DWI"], 1)
        self.assertEqual(counts["Reckless Driving"], 1)
        # Factors with zero seeded statutes still appear, with count = 0.
        self.assertEqual(counts["Fleeing a Police Officer"], 0)

    # --------------------------------------------- GET /statutes/{statute_id}

    def test_get_statute_happy_path(self) -> None:
        response = self.client.get("/statutes/ca-veh-22350")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["statute_id"], "ca-veh-22350")
        self.assertEqual(body["section_number"], "22350")
        self.assertIn("leginfo.legislature.ca.gov", body["official_url"])
        self.assertEqual(body["factors"], ["Driving Too Fast For Conditions"])

    def test_get_statute_with_subdivision(self) -> None:
        body = self.client.get("/statutes/ca-veh-23103-a").json()
        self.assertEqual(body["section_number"], "23103")
        self.assertEqual(body["subdivision"], "a")

    def test_get_statute_404_on_missing_slug(self) -> None:
        response = self.client.get("/statutes/ca-veh-99999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "statute not found")

    def test_get_statute_400_on_bad_slug(self) -> None:
        response = self.client.get("/statutes/Cal.%20Veh.%20Code")
        self.assertEqual(response.status_code, 400)

    # ------------------------------------------------ POST /statutes/search

    def test_search_citation_fast_path(self) -> None:
        response = self.client.post(
            "/statutes/search",
            json={"query": "Cal. Veh. Code § 22350", "top_k": 5},
        )
        self.assertEqual(response.status_code, 200, response.text)
        results = response.json()["results"]
        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]["statute_id"], "ca-veh-22350")
        self.assertEqual(results[0]["matched_via"], "citation")
        self.assertEqual(results[0]["score"], 1.0)

    def test_search_citation_with_subdivision(self) -> None:
        response = self.client.post(
            "/statutes/search",
            json={"query": "Cal. Veh. Code § 23103(a)", "top_k": 5},
        )
        results = response.json()["results"]
        self.assertEqual(results[0]["statute_id"], "ca-veh-23103-a")

    def test_search_factor_filter_returns_only_tagged(self) -> None:
        response = self.client.post(
            "/statutes/search",
            json={"query": "passing on the right", "factor": "Improper Passing", "top_k": 10},
        )
        self.assertEqual(response.status_code, 200, response.text)
        results = response.json()["results"]
        self.assertGreaterEqual(len(results), 1)
        for hit in results:
            self.assertIn("Improper Passing", hit["factors"])

    def test_search_factor_unknown_returns_400(self) -> None:
        response = self.client.post(
            "/statutes/search",
            json={"query": "anything", "factor": "Not A Real Factor"},
        )
        self.assertEqual(response.status_code, 400)

    def test_search_free_text_returns_results(self) -> None:
        # We don't assert which statute ranks first — the embedding model on
        # a 7-row corpus is not stable enough for that. But search must
        # surface at least one result and never crash.
        response = self.client.post(
            "/statutes/search",
            json={"query": "wireless telephone", "top_k": 5},
        )
        self.assertEqual(response.status_code, 200, response.text)
        results = response.json()["results"]
        self.assertGreaterEqual(len(results), 1)
        result_ids = [hit["statute_id"] for hit in results]
        self.assertIn("ca-veh-23123-a", result_ids)

    def test_search_empty_query_rejected(self) -> None:
        response = self.client.post("/statutes/search", json={"query": ""})
        self.assertEqual(response.status_code, 422)

    # ------------------------------------------------------------- /status

    def test_status_reports_seeded_statutes(self) -> None:
        body = self.client.get("/status").json()
        self.assertGreaterEqual(body["indexed_statutes"], len(SEED_STATUTES))
        self.assertIn("California", body["jurisdictions"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
