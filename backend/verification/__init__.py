"""Verification layer — citation + quote audit on agent answers.

Public surface:

  - `verify_turn(answer_text, evidence)` — main entry. Returns a
    `VerificationReport` describing supported/unsupported citations and
    quotations.
  - `Evidence` — one source the agent retrieved this turn. The agent
    loop builds these from the union of statute hits + web hits.
  - `VerificationReport`, `UnsupportedCitation`, `UnsupportedQuote` —
    JSON-serializable result types the API surfaces to the frontend.
"""

from backend.verification.verify import (
    Evidence,
    UnsupportedCitation,
    UnsupportedQuote,
    VerificationReport,
    verify_turn,
)

__all__ = [
    "Evidence",
    "UnsupportedCitation",
    "UnsupportedQuote",
    "VerificationReport",
    "verify_turn",
]
