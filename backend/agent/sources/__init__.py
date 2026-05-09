"""Tool sources the chat agent can call.

Each module exposes:

- `TOOL_SCHEMAS: list[dict]` — Anthropic tool-use declarations to register.
- `run(name, tool_input, *, db, ...) -> ToolResult` — executes a named tool.

The agent loop dispatches by tool `name`; nothing in the loop knows what a
"statute" or a "web hit" is. Adding a new data source = new module + new
entries in the agent's `ALL_TOOLS` list.
"""

from __future__ import annotations
