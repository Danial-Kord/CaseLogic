"""Smoke tests for the `/chats` adapter — the surface the frontend speaks.

These tests bypass Chroma / FTS5 entirely: the agent's Anthropic client is
stubbed to return canned responses with no tool_use blocks, and statute hits
that the route enriches are pre-seeded in the `statutes` table. That lets us
run on a machine without `chromadb` installed.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def _bind_temp_paths_before_import() -> Path:
    tmp_root = Path(tempfile.mkdtemp(prefix="caselogic-chats-"))
    db_path = tmp_root / "test.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
    return tmp_root


_TMP_ROOT = _bind_temp_paths_before_import()


from fastapi.testclient import TestClient  # noqa: E402

from backend.agent import loop as agent_loop  # noqa: E402
from backend.agent.sources import statute as statute_source  # noqa: E402
from backend.db import get_session, init_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.models import Statute, StatuteFactor  # noqa: E402


SEED_STATUTE = {
    "statute_id": "ca-veh-21453-a",
    "section": "21453",
    "subdivision": "a",
    "citation": "Cal. Veh. Code § 21453(a)",
    "text": (
        "A driver facing a steady circular red signal alone shall stop at a "
        "marked limit line, but if none, before entering the crosswalk."
    ),
    "factor": "Failure to Obey Traffic Control Device",
}


# ---------------------------------------------------------- fake Anthropic


@dataclass
class FakeBlock:
    type: str
    text: str = ""


@dataclass
class FakeResponse:
    content: list[FakeBlock]
    stop_reason: str = "end_turn"


class FakeMessages:
    def __init__(self, parent: "FakeAnthropic") -> None:
        self._parent = parent

    def create(self, **kwargs: Any) -> FakeResponse:
        if not self._parent.scripted:
            raise RuntimeError("FakeAnthropic ran out of scripted responses")
        return self._parent.scripted.popleft()


class FakeAnthropic:
    def __init__(self) -> None:
        self.scripted: deque[FakeResponse] = deque()
        self.messages = FakeMessages(self)

    def script(self, *responses: FakeResponse) -> None:
        self.scripted.extend(responses)

    def reset(self) -> None:
        self.scripted.clear()


# --------------------------------------------------------------- helpers


def _seed() -> None:
    init_db()
    with get_session() as session:
        statute = Statute(
            statute_id=SEED_STATUTE["statute_id"],
            jurisdiction="California",
            code_name="Cal. Veh. Code",
            section_number=SEED_STATUTE["section"],
            universal_citation=SEED_STATUTE["citation"],
            subdivision=SEED_STATUTE["subdivision"],
            division="Division 11",
            chapter="Chapter 2",
            statute_text=SEED_STATUTE["text"],
            complete_statute=f"Pursuant to {SEED_STATUTE['citation']}, {SEED_STATUTE['text']}",
            official_url=(
                "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml"
                "?lawCode=VEH&sectionNum=21453"
            ),
        )
        statute.factors.append(
            StatuteFactor(
                factor=SEED_STATUTE["factor"], confidence=0.9, quote=SEED_STATUTE["text"][:80],
            )
        )
        session.add(statute)


# ---------------------------------------------------------------- tests


class ChatsAdapterSmoke(unittest.TestCase):
    """Hits the `/chats` surface the frontend uses."""

    @classmethod
    def setUpClass(cls) -> None:
        _seed()
        cls.fake_anthropic = FakeAnthropic()
        agent_loop._build_anthropic = lambda _settings: cls.fake_anthropic  # type: ignore[assignment]
        cls.client_cm = TestClient(app)
        cls.client = cls.client_cm.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_cm.__exit__(None, None, None)
        shutil.rmtree(_TMP_ROOT, ignore_errors=True)

    def setUp(self) -> None:
        self.fake_anthropic.reset()

    # ---------------------------------------------------- lifecycle

    def test_create_list_get_delete(self) -> None:
        # Create
        r = self.client.post("/chats", json={})
        self.assertEqual(r.status_code, 201, r.text)
        chat = r.json()
        self.assertIn("chat_id", chat)
        self.assertEqual(chat["title"], "New chat")
        self.assertEqual(chat["messages"], [])
        chat_id = chat["chat_id"]

        # List shows the new chat
        r = self.client.get("/chats")
        self.assertEqual(r.status_code, 200, r.text)
        chats = r.json()["chats"]
        self.assertTrue(any(c["chat_id"] == chat_id for c in chats))
        match = next(c for c in chats if c["chat_id"] == chat_id)
        self.assertEqual(match["title"], "New chat")
        self.assertEqual(match["message_count"], 0)

        # Get returns the empty thread
        r = self.client.get(f"/chats/{chat_id}")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["messages"], [])

        # Delete
        r = self.client.delete(f"/chats/{chat_id}")
        self.assertEqual(r.status_code, 204)
        r = self.client.get(f"/chats/{chat_id}")
        self.assertEqual(r.status_code, 404)

    # -------------------------------------------- send-message round-trip

    def test_send_message_returns_user_assistant_pair(self) -> None:
        # Stub Claude to answer immediately, no tool calls, but inject a
        # statute_id into the agent's hit list via a monkey-patched dispatch.
        canned = "California requires drivers to stop at red lights [cite: ca-veh-21453-a]."
        self.fake_anthropic.script(
            FakeResponse(content=[FakeBlock(type="text", text=canned)])
        )

        # Inject a statute_hit by patching the loop — simulates the agent
        # having run search_statutes and accumulated a hit. We do this here
        # so we don't need the full retrieval stack.
        original_run = agent_loop.run_agent_turn

        def patched(*, db, session_id, user_message, **_):
            turn = original_run(db=db, session_id=session_id, user_message=user_message)
            turn.statute_hits.append(
                statute_source.StatuteToolHit(
                    statute_id=SEED_STATUTE["statute_id"],
                    universal_citation=SEED_STATUTE["citation"],
                    snippet=SEED_STATUTE["text"][:80],
                    score=0.91,
                    matched_via="hybrid",
                    official_url="https://example.invalid",
                )
            )
            return turn

        agent_loop.run_agent_turn = patched  # type: ignore[assignment]
        # Also patch the import the route uses
        from backend.api import routes_chats as _rc
        _rc.run_agent_turn = patched  # type: ignore[assignment]

        try:
            r = self.client.post("/chats", json={})
            chat_id = r.json()["chat_id"]

            r = self.client.post(
                f"/chats/{chat_id}/messages",
                json={"content": "What is the rule for red lights?"},
            )
            self.assertEqual(r.status_code, 200, r.text)
            body = r.json()

            # Both rows present, frontend-shaped
            self.assertEqual(body["user_message"]["role"], "user")
            self.assertEqual(
                body["user_message"]["content"], "What is the rule for red lights?"
            )
            self.assertEqual(body["user_message"]["hits"], [])

            self.assertEqual(body["assistant_message"]["role"], "assistant")
            self.assertIn("California requires drivers to stop", body["assistant_message"]["content"])

            # Hits enriched against the statutes table
            hits = body["assistant_message"]["hits"]
            self.assertEqual(len(hits), 1)
            hit = hits[0]
            self.assertEqual(hit["statute_id"], SEED_STATUTE["statute_id"])
            self.assertEqual(hit["universal_citation"], SEED_STATUTE["citation"])
            self.assertEqual(hit["division"], "Division 11")
            self.assertEqual(hit["chapter"], "Chapter 2")
            self.assertEqual(hit["matched_via"], "hybrid")
            self.assertAlmostEqual(hit["score"], 0.91)
            self.assertIn("Failure to Obey Traffic Control Device", hit["factors"])

            # Title auto-generated from the user message
            self.assertIn("red lights", body["chat_title"].lower())

            # Reload — hits persisted on the assistant row
            r = self.client.get(f"/chats/{chat_id}")
            self.assertEqual(r.status_code, 200, r.text)
            messages = r.json()["messages"]
            self.assertEqual(len(messages), 2)
            self.assertEqual(messages[0]["role"], "user")
            self.assertEqual(messages[1]["role"], "assistant")
            self.assertEqual(len(messages[1]["hits"]), 1)
            self.assertEqual(
                messages[1]["hits"][0]["statute_id"], SEED_STATUTE["statute_id"]
            )

            # Sidebar count picked up the new turn
            r = self.client.get("/chats")
            chats = r.json()["chats"]
            match = next(c for c in chats if c["chat_id"] == chat_id)
            self.assertGreaterEqual(match["message_count"], 2)

        finally:
            agent_loop.run_agent_turn = original_run  # type: ignore[assignment]
            _rc.run_agent_turn = original_run  # type: ignore[assignment]

    # ---------------------------------------------------- error paths

    def test_send_to_unknown_chat_returns_404(self) -> None:
        self.fake_anthropic.script(
            FakeResponse(content=[FakeBlock(type="text", text="...")])
        )
        r = self.client.post(
            "/chats/00000000-0000-0000-0000-000000000000/messages",
            json={"content": "hi"},
        )
        self.assertEqual(r.status_code, 404, r.text)

    def test_get_unknown_chat_returns_404(self) -> None:
        r = self.client.get("/chats/00000000-0000-0000-0000-000000000000")
        self.assertEqual(r.status_code, 404)

    def test_empty_content_rejected(self) -> None:
        r = self.client.post("/chats", json={})
        chat_id = r.json()["chat_id"]
        r = self.client.post(f"/chats/{chat_id}/messages", json={"content": ""})
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main()
