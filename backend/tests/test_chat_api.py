"""Smoke test for the chat agent + /chat API.

Run with either:

    python -m unittest backend.tests.test_chat_api
    python -m backend.tests.test_chat_api

The Anthropic client and Firecrawl client are both replaced with deterministic
in-process fakes so this runs offline. We do still build Chroma + FTS5 against
a small statute seed (matches the pattern in `test_retrieval_api.py`) so the
real `search_statutes` tool is exercised end-to-end.
"""

from __future__ import annotations

import copy
import os
import shutil
import tempfile
import unittest
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def _bind_temp_paths_before_import() -> Path:
    """See test_retrieval_api for why this runs at module import time."""

    tmp_root = Path(tempfile.mkdtemp(prefix="caselogic-chat-"))
    db_path = tmp_root / "test.db"
    index_path = tmp_root / "index"
    index_path.mkdir(parents=True, exist_ok=True)
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ["VECTOR_INDEX_PATH"] = str(index_path)
    # The real ANTHROPIC_API_KEY is irrelevant — we patch _build_anthropic.
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
    return tmp_root


_TMP_ROOT = _bind_temp_paths_before_import()


from fastapi.testclient import TestClient  # noqa: E402

from backend.agent import loop as agent_loop  # noqa: E402
from backend.agent.sources import web as web_source  # noqa: E402
from backend.db import get_session, init_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.models import Statute, StatuteFactor  # noqa: E402
from backend.retrieval import make_statute_id  # noqa: E402
from backend.retrieval.keyword_search import rebuild_fts  # noqa: E402
from backend.retrieval.vector_store import (  # noqa: E402
    reset_collection,
    upsert_statutes,
)


SEED_STATUTES: list[dict[str, Any]] = [
    {
        "section": "21453",
        "subdivision": "a",
        "citation": "Cal. Veh. Code § 21453(a)",
        "text": (
            "A driver facing a steady circular red signal alone shall stop at a "
            "marked limit line, but if none, before entering the crosswalk on "
            "the near side of the intersection, and shall remain stopped until "
            "an indication to proceed is shown."
        ),
        "factor": "Failure to Obey Traffic Control Device",
    },
    {
        "section": "22350",
        "subdivision": None,
        "citation": "Cal. Veh. Code § 22350",
        "text": (
            "[N]o person shall drive a vehicle upon a highway at a speed greater "
            "than is reasonable or prudent having due regard for weather, "
            "visibility, the traffic on, and the surface and width of, the highway."
        ),
        "factor": "Driving Too Fast For Conditions",
    },
]


# ---------------------------------------------------------- fake Anthropic


@dataclass
class FakeBlock:
    type: str
    text: str = ""
    id: str = ""
    name: str = ""
    input: dict | None = None


@dataclass
class FakeResponse:
    content: list[FakeBlock]
    stop_reason: str = "end_turn"


class FakeMessages:
    def __init__(self, parent: "FakeAnthropic") -> None:
        self._parent = parent

    def create(self, **kwargs: Any) -> FakeResponse:
        # Deep-copy so subsequent in-loop mutations of `messages` don't
        # rewrite the snapshot we record here. The real Anthropic SDK
        # serializes the kwargs immediately on the network path, so this
        # behavior matches production.
        self._parent.calls.append(
            {k: copy.deepcopy(v) for k, v in kwargs.items()}
        )
        if not self._parent.scripted:
            raise RuntimeError(
                "FakeAnthropic.messages.create called more times than scripted"
            )
        return self._parent.scripted.popleft()


class FakeAnthropic:
    """Drop-in replacement for `anthropic.Anthropic` that returns a queue of
    pre-baked responses. Tests push expected responses with `script(...)`."""

    def __init__(self) -> None:
        self.scripted: deque[FakeResponse] = deque()
        self.calls: list[dict[str, Any]] = []
        self.messages = FakeMessages(self)

    def script(self, *responses: FakeResponse) -> None:
        self.scripted.extend(responses)

    def reset(self) -> None:
        self.scripted.clear()
        self.calls.clear()


# ----------------------------------------------------------- fake Firecrawl


class FakeFirecrawl:
    """Used when a test wants to exercise web_search."""

    def __init__(self, results_by_query: dict[str, list[dict[str, Any]]]) -> None:
        self._results = results_by_query
        self.calls: list[tuple[str, int]] = []

    def search(self, query: str, *, limit: int) -> list[dict[str, Any]]:
        self.calls.append((query, limit))
        return list(self._results.get(query, []))


# --------------------------------------------------------------- helpers


def _seed_database() -> None:
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
                    factor=row["factor"], confidence=0.9, quote=row["text"][:120]
                )
            )
            session.add(statute)


def _build_indices() -> None:
    reset_collection()
    with get_session() as session:
        statutes = list(session.query(Statute).all())
        upsert_statutes(statutes)
        rebuild_fts(session)


# -------------------------------------------------------------- tests


class ChatApiSmoke(unittest.TestCase):
    """End-to-end smoke against the fake Anthropic + fake Firecrawl."""

    fake_anthropic: FakeAnthropic
    fake_firecrawl: FakeFirecrawl | None = None

    @classmethod
    def setUpClass(cls) -> None:
        _seed_database()
        _build_indices()
        cls.fake_anthropic = FakeAnthropic()
        # Patch the internal builders so route handlers pick up our fakes
        # without needing to thread params through FastAPI.
        agent_loop._build_anthropic = lambda _settings: cls.fake_anthropic  # type: ignore[assignment]
        web_source._build_client = lambda _settings: cls.fake_firecrawl  # type: ignore[assignment]
        cls.client_cm = TestClient(app)
        cls.client = cls.client_cm.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_cm.__exit__(None, None, None)
        shutil.rmtree(_TMP_ROOT, ignore_errors=True)

    def setUp(self) -> None:
        self.fake_anthropic.reset()
        ChatApiSmoke.fake_firecrawl = None

    # ------------------------------------------------ session lifecycle

    def test_create_list_get_delete_session_lifecycle(self) -> None:
        # Empty list initially (other tests may have seeded; assert >=0).
        before = self.client.get("/chat/sessions").json()
        baseline_count = len(before["sessions"])

        # Create
        created = self.client.post("/chat/sessions")
        self.assertEqual(created.status_code, 201, created.text)
        sid = created.json()["session_id"]
        self.assertEqual(len(sid), 36)  # uuid4

        # List shows it
        listing = self.client.get("/chat/sessions").json()
        self.assertEqual(len(listing["sessions"]), baseline_count + 1)
        ids = [s["session_id"] for s in listing["sessions"]]
        self.assertIn(sid, ids)

        # Get returns it with empty messages
        detail = self.client.get(f"/chat/sessions/{sid}").json()
        self.assertEqual(detail["session_id"], sid)
        self.assertEqual(detail["messages"], [])

        # Delete cascades
        delete_resp = self.client.delete(f"/chat/sessions/{sid}")
        self.assertEqual(delete_resp.status_code, 204)
        self.assertEqual(self.client.get(f"/chat/sessions/{sid}").status_code, 404)

    # --------------------------------------------- single tool-using turn

    def test_post_chat_runs_tool_use_loop(self) -> None:
        # Step 1: model asks to call search_statutes.
        # Step 2: model produces final text.
        self.fake_anthropic.script(
            FakeResponse(
                content=[
                    FakeBlock(
                        type="tool_use",
                        id="tool_1",
                        name="search_statutes",
                        input={"query": "running a red light", "top_k": 3},
                    ),
                ],
                stop_reason="tool_use",
            ),
            FakeResponse(
                content=[
                    FakeBlock(
                        type="text",
                        text=(
                            "California drivers must stop at a steady red signal. "
                            "[cite: ca-veh-21453-a] This is a research prototype, "
                            "not legal advice."
                        ),
                    ),
                ],
                stop_reason="end_turn",
            ),
        )

        resp = self.client.post(
            "/chat",
            json={"message": "What's the rule for running a red light in CA?"},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()

        sid = body["session_id"]
        self.assertEqual(len(sid), 36)
        self.assertIn("ca-veh-21453-a", body["turn"]["assistant_text"])
        self.assertEqual(len(body["turn"]["tool_calls"]), 1)
        self.assertEqual(body["turn"]["tool_calls"][0]["name"], "search_statutes")

        # Sources surfaced for the frontend
        statute_sources = [
            s for s in body["turn"]["sources"] if s["kind"] == "statute"
        ]
        self.assertGreaterEqual(len(statute_sources), 1)
        self.assertEqual(statute_sources[0]["statute"]["statute_id"], "ca-veh-21453-a")

        # Auto-title from first user message
        self.assertIsNotNone(body["session_title"])
        self.assertIn("running a red light", body["session_title"].lower())

        # Persisted: 1 user + 1 assistant(tool_use) + 1 tool_result + 1 assistant(final) = 4
        detail = self.client.get(f"/chat/sessions/{sid}").json()
        roles = [m["role"] for m in detail["messages"]]
        self.assertEqual(roles, ["user", "assistant", "tool_result", "assistant"])

    # --------------------------------------------- multi-turn memory

    def test_followup_turn_sees_history(self) -> None:
        # Turn 1: tool_use + final
        self.fake_anthropic.script(
            FakeResponse(
                content=[
                    FakeBlock(
                        type="tool_use",
                        id="tool_a",
                        name="search_statutes",
                        input={"query": "basic speed law"},
                    ),
                ],
                stop_reason="tool_use",
            ),
            FakeResponse(
                content=[
                    FakeBlock(
                        type="text",
                        text=(
                            "Section 22350 sets the basic speed rule. [cite: ca-veh-22350]"
                        ),
                    ),
                ],
                stop_reason="end_turn",
            ),
        )
        first = self.client.post(
            "/chat",
            json={"message": "What's the basic speed law?"},
        )
        self.assertEqual(first.status_code, 200, first.text)
        sid = first.json()["session_id"]

        # Turn 2: model just produces text — but receives history, so the
        # message list it gets must include the first user + assistant +
        # tool_result + assistant turn AND the new user message.
        self.fake_anthropic.script(
            FakeResponse(
                content=[
                    FakeBlock(
                        type="text",
                        text="The penalty is an infraction. [cite: ca-veh-22350]",
                    ),
                ],
                stop_reason="end_turn",
            ),
        )
        followup = self.client.post(
            "/chat",
            json={"session_id": sid, "message": "And the penalty?"},
        )
        self.assertEqual(followup.status_code, 200, followup.text)

        # Confirm Claude saw the prior turn in `messages`.
        last_call = self.fake_anthropic.calls[-1]
        roles_seen = [m["role"] for m in last_call["messages"]]
        # Expected: [user, assistant, user(tool_result), assistant, user(new)]
        self.assertEqual(roles_seen[-1], "user")
        self.assertGreaterEqual(roles_seen.count("user"), 3)
        self.assertGreaterEqual(roles_seen.count("assistant"), 2)

        detail = self.client.get(f"/chat/sessions/{sid}").json()
        self.assertEqual(len(detail["messages"]), 6)

    # -------------------------------------- web_search whitelist filter

    def test_web_search_drops_non_whitelisted_domains(self) -> None:
        ChatApiSmoke.fake_firecrawl = FakeFirecrawl(
            results_by_query={
                "ca driving cases 2024": [
                    # Allowed: courtlistener.com (exact host)
                    {
                        "url": "https://www.courtlistener.com/opinion/9999/foo/",
                        "title": "Some CA opinion",
                        "description": "An appellate decision...",
                    },
                    # Allowed: *.gov match (cdn.ca.gov)
                    {
                        "url": "https://cdn.ca.gov/regs/foo.html",
                        "title": "DMV reg",
                        "description": "Regulation snippet",
                    },
                    # Rejected: random blog
                    {
                        "url": "https://lawblog.example.com/post/123",
                        "title": "Hot take",
                        "description": "Marketing content",
                    },
                    # Rejected: non-http or missing url
                    {"url": "javascript:void(0)", "title": "broken"},
                ],
            }
        )
        self.fake_anthropic.script(
            FakeResponse(
                content=[
                    FakeBlock(
                        type="tool_use",
                        id="web_1",
                        name="web_search",
                        input={"query": "ca driving cases 2024", "max_results": 5},
                    ),
                ],
                stop_reason="tool_use",
            ),
            FakeResponse(
                content=[
                    FakeBlock(
                        type="text",
                        text=(
                            "Found one appellate decision. "
                            "[cite: https://www.courtlistener.com/opinion/9999/foo/]"
                        ),
                    ),
                ],
                stop_reason="end_turn",
            ),
        )

        resp = self.client.post(
            "/chat",
            json={"message": "Find a recent CA appellate decision interpreting 21453."},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()

        web_sources = [s for s in body["turn"]["sources"] if s["kind"] == "web"]
        domains = [s["web"]["domain"] for s in web_sources]
        # Both whitelisted survived; the blog and the broken URL are gone.
        self.assertIn("www.courtlistener.com", domains)
        self.assertIn("cdn.ca.gov", domains)
        self.assertNotIn("lawblog.example.com", domains)
        self.assertEqual(len(web_sources), 2)

    def test_web_search_all_rejected_returns_note(self) -> None:
        ChatApiSmoke.fake_firecrawl = FakeFirecrawl(
            results_by_query={
                "shady": [
                    {
                        "url": "https://lawblog.example.com/a",
                        "title": "blog",
                        "description": "x",
                    },
                    {
                        "url": "https://marketing.example.com/b",
                        "title": "spam",
                        "description": "y",
                    },
                ]
            }
        )
        # Model: tool_use → final
        self.fake_anthropic.script(
            FakeResponse(
                content=[
                    FakeBlock(
                        type="tool_use",
                        id="web_2",
                        name="web_search",
                        input={"query": "shady", "max_results": 3},
                    ),
                ],
                stop_reason="tool_use",
            ),
            FakeResponse(
                content=[
                    FakeBlock(
                        type="text",
                        text=(
                            "I couldn't find an authoritative public source for "
                            "this. (unsupported \u2014 no source found)"
                        ),
                    ),
                ],
                stop_reason="end_turn",
            ),
        )

        resp = self.client.post("/chat", json={"message": "Find me anything."})
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        web_sources = [s for s in body["turn"]["sources"] if s["kind"] == "web"]
        self.assertEqual(web_sources, [])
        self.assertIn("(unsupported", body["turn"]["assistant_text"])

    # --------------------------------------- error cases

    def test_post_chat_unknown_session_returns_404(self) -> None:
        resp = self.client.post(
            "/chat",
            json={"session_id": "00000000-0000-0000-0000-000000000000", "message": "hi"},
        )
        self.assertEqual(resp.status_code, 404)

    def test_post_chat_empty_message_rejected(self) -> None:
        resp = self.client.post("/chat", json={"message": ""})
        self.assertEqual(resp.status_code, 422)

    def test_create_then_get_session_returns_messages_in_order(self) -> None:
        self.fake_anthropic.script(
            FakeResponse(
                content=[FakeBlock(type="text", text="hello [cite: ca-veh-22350]")],
                stop_reason="end_turn",
            ),
        )
        resp = self.client.post("/chat", json={"message": "say hi"})
        sid = resp.json()["session_id"]

        detail = self.client.get(f"/chat/sessions/{sid}").json()
        self.assertEqual(len(detail["messages"]), 2)
        self.assertEqual(detail["messages"][0]["role"], "user")
        self.assertEqual(detail["messages"][1]["role"], "assistant")
        # Messages are JSON-block lists.
        self.assertIsInstance(detail["messages"][0]["content"], list)
        self.assertEqual(detail["messages"][0]["content"][0]["type"], "text")


if __name__ == "__main__":
    unittest.main(verbosity=2)
