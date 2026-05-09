"""Planning agent — orchestrator + three sequential sub-agents.

Public surface:

  - `run_plan(...)` — main entry point; persists sections as it goes,
    emits SSE-friendly events through `on_event`, returns a `PlanResult`.
  - `PlanResult` — lightweight return value; routes re-load the full
    `Plan` row to build the API response.
  - `PlanNotFound` — raised when the caller passes a missing plan_id;
    routes convert to 404.
  - Section-kind constants (`KIND_CASES`, `KIND_CONTACTS`, `KIND_BRIEF`,
    `SECTION_KINDS`) — frontend matches these byte-exact.
"""

from backend.planning.orchestrator import (
    KIND_BRIEF,
    KIND_CASES,
    KIND_CONTACTS,
    SECTION_KINDS,
    PlanNotFound,
    PlanResult,
    run_plan,
)

__all__ = [
    "KIND_BRIEF",
    "KIND_CASES",
    "KIND_CONTACTS",
    "SECTION_KINDS",
    "PlanNotFound",
    "PlanResult",
    "run_plan",
]
