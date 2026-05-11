# Design Notes

Living delta log of decisions made during the build. The baseline architecture spec is kept
locally (not tracked in git); this file only records *what we picked* + *why*.

---

## Phase 1 — Kickoff lock-ins (2026-05-09)

### Variant: A — PI Case Comparator

Picked from baseline Section 9. Rationale:

- Broadest fit with the baseline modules (ingest → extract → retrieve → compare → verify).
- Comparison-table UI gives judges a 30-second readable demo (Failure Mode 5).
- Extracted fields (injury, accident, damages, liability) are the same fields a PI
  attorney looks up — the value framing writes itself.
- Bonus tiers (damages calibrator, multi-hop comparator) stack on this variant
  rather than requiring a different one.

### Source / jurisdiction

**Deferred.** Phase 2 will pick a single public source. Ontario case law via CanLII
is the working assumption from the plan, but no CanLII-specific code lands until we
confirm the held-out eval sample's jurisdiction at kickoff.

### Extraction schema

Locked in [`backend/extraction/schemas.py`](../backend/extraction/schemas.py).
Five Pydantic models for Variant A:

- `SourceSupport` — every extracted field carries one (URL + paragraph + quote).
- `Damages` — non-pecuniary, future-care, past-loss-of-income, future-loss-of-income,
  total. All optional strings (we want the *quoted dollar amount*, not a parsed number,
  to preserve verifiability).
- `Liability` — finding (`plaintiff`/`defendant`/`shared`/`unclear`), apportionment,
  contributory-negligence flag.
- `PICaseFields` — accident_type, injuries, damages, liability, key_facts, legal_issues,
  jurisdiction, court, decision_date, citation.
- `PICaseExtraction` — the full envelope: document_id, schema name, fields, confidence,
  source_support list. This is what `extract.py` returns.

Fields are kept narrow on purpose — every field has to be useful for comparison or
filtering. Don't add columns we won't surface in the UI (Failure Mode 3: too broad).

### Stack confirmations

- Backend: FastAPI + SQLAlchemy + SQLite — already in `requirements.txt`.
- Frontend: **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3.4** — initialized
  this phase. Plan originally suggested Vite; team picked Next.js. `next.config.mjs`
  rewrites `/api/*` to `http://localhost:8000/*` so the App Router app can talk to
  FastAPI without CORS in dev.
- LLM: Claude (Anthropic SDK already in `requirements.txt`).
- Vector DB: Chroma (decision deferred until Phase 2 actually needs it; `chromadb` is
  already pinned).
- Embeddings: deferred to Phase 2 — pick when we know what's reachable from the
  available network.

### Skipped this phase (intentionally)

- CanLII adapter — deferred until eval sample lands.
- Embedding provider choice — same reason.
- Any backend route logic — Phase 2 starts the first end-to-end loop.
