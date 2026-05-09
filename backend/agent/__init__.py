"""Chat agent runtime — Anthropic tool-use loop over local + web sources.

Public entry points:

- `run_agent_turn(session_id, user_message, *, db, anthropic_client=None,
  web_client=None) -> AgentTurn` — runs one assistant turn end-to-end:
  load history, call Claude with tools, execute tool calls, persist, return.

The loop calls Claude with two kinds of tools registered:
  * statute tools (`search_statutes`, `get_statute`) — local hybrid retrieval
  * web tool (`web_search`) — Firecrawl, domain-whitelisted

Session + message persistence lives in `backend.models` (`ChatSession`,
`ChatMessage`); the API layer is `backend.api.routes_chat`.
"""

from __future__ import annotations

from backend.agent.loop import AgentTurn, run_agent_turn

__all__ = ["AgentTurn", "run_agent_turn"]
