# CaseLogic — Source-Grounded Legal Research Assistant

**3rd place at the EvenUp × OpenClaw Hackathon** — built from scratch in under 24 hours.

[![Demo Video](https://img.shields.io/badge/Demo-YouTube-red?logo=youtube)](https://youtu.be/7VE8Qm21KM8)

> A source-grounded legal research assistant for personal-injury attorneys. Every claim is linked to a real public statute — no fabricated citations, no model-memory shortcuts.

**[Watch the demo →](https://youtu.be/7VE8Qm21KM8)**

Full spec: [openclaw_hackathon_baseline_architecture.md](openclaw_hackathon_baseline_architecture.md).

For a short cheat sheet on adapters, extraction/retrieval/reasoning/verification, and OpenClaw’s role, see **Architecture Q&A** below (after the kickoff checklist).

**Phased prep plan with technology guide:** [docs/plan.md](docs/plan.md).

**Phase-1 MVP plan (CA Vehicle Code Harvester, query → UI):** [docs/phase1_plan.md](docs/phase1_plan.md). That doc describes the statute tables, hybrid retrieval, and `/statutes` API to build next; not all of it is implemented in the repo yet.

## Current state

The repo is **past blank scaffolding** in a few areas, but **most pipeline modules are still stubs**.

### Implemented

- **FastAPI app** ([backend/main.py](backend/main.py)): CORS for `http://localhost:3000`, `init_db` on startup, `/healthz`.
- **Status + ingest API** ([backend/api/](backend/api/)):
  - `GET /status` — document counts + sample URLs from the `documents` table.
  - `POST /ingest/search` — Claude `web_search_20250305` discovers URLs, then `httpx` fetches and persists rows (deduped by URL).
  - `POST /ingest/url` — direct URL fetch + persist.
- **Persistence** ([backend/config.py](backend/config.py), [backend/db.py](backend/db.py), [backend/models.py](backend/models.py)): SQLite via SQLAlchemy; **`documents` table only** (no `statutes` / Phase-1 statute schema in code yet).
- **Ingestion** ([backend/ingestion/](backend/ingestion/)): `WebAdapter` + `ingest_search` pipeline written end-to-end for web search → fetch → `Document` rows; `base.py` protocol; `canlii` / `pdf` adapters are still one-line stubs.
- **Extraction types** ([backend/extraction/schemas.py](backend/extraction/schemas.py)): full Pydantic models for Variant A (PI case comparator) — `PICaseFields`, damages, liability, `SourceSupport`. `extract.py` / `prompts.py` are not wired to production extraction yet.
- **Smoke check** ([backend/smoke_check.py](backend/smoke_check.py)): `python -m backend.smoke_check` verifies deps + `ANTHROPIC_API_KEY`.
- **Frontend** ([frontend/](frontend/)): Next.js 15 + React 19 + Tailwind; three-column shell matching the baseline layout. **Components still return `null`** — no live API wiring.

### Still stubs or missing

- **Statute Harvester (Phase 1 per brief):** `Statute` / `StatuteFactor` models, Chroma + FTS5 hybrid retrieval, `GET /statutes/{id}`, `POST /statutes/search`, `GET /factors` — specified in [docs/phase1_plan.md](docs/phase1_plan.md); **not present in `backend/` yet** (e.g. `routes_statutes.py`, `retrieval/*` implementations).
- **Parsing, chunking, case-law extraction runtime**, **retrieval indexes**, **reasoning**, **verification** — baseline modules exist as placeholder files.
- **OpenClaw** — [openclaw/tools.json](openclaw/tools.json) / [openclaw/agent_prompt.md](openclaw/agent_prompt.md) not filled for statute tools.

## Repo layout

```
.env.example              ANTHROPIC_API_KEY, DATABASE_URL, VECTOR_INDEX_PATH
requirements.txt          fastapi, anthropic, chromadb, sqlalchemy, httpx, ...
package.json              npm scripts that delegate to frontend/

backend/                  Python package — FastAPI app
  main.py                 app entry, routers: status + ingest
  config.py / db.py       runtime config + SQLAlchemy session
  models.py               documents table (statute tables = planned in phase1_plan)
  ingestion/              pipeline + adapters (web implemented; canlii/pdf stub)
  parsing/                stubs
  extraction/             schemas.py (PI case Pydantic); extract/prompts stub
  retrieval/              stubs (Chroma + hybrid planned)
  reasoning/              stubs
  verification/           stubs
  api/                    routes_ingest, routes_status (+ routes_search/answer/verify stub)
  smoke_check.py

openclaw/                 agent_prompt.md, tools.json — minimal / empty
frontend/                 Next.js app: app/, components/ (UI placeholders)
data/                     raw/, processed/, exports/, index/  (.gitkeep)
docs/                     plan.md, phase1_plan.md, architecture.md, demo_script.md, ...
```

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
cp .env.example .env      # then fill in ANTHROPIC_API_KEY (needed for /ingest/search)
```

**Frontend (optional):**

```bash
npm install --prefix frontend
npm run dev                 # from repo root: runs Next dev server (see package.json)
```

## Run the backend

```bash
uvicorn backend.main:app --reload
```

Use `/docs` for interactive OpenAPI. **Smallest working loop today:** `POST /ingest/url` or `/ingest/search` → rows in SQLite + `GET /status`.

## Next milestones (aligned with hackathon + [docs/phase1_plan.md](docs/phase1_plan.md))

1. **Data:** CA Vehicle Code ingest (e.g. leginfo) → `statutes` + `statute_factors` (or equivalent) with real `official_url` per row.
2. **Retrieval:** implement Chroma + SQLite FTS5 + RRF hybrid search; `python -m backend.retrieval.build` (or equivalent) after ingest.
3. **API:** statute lookup + search + factor listing; extend `/status` for statute counts and eval metadata.
4. **UI:** wire `SearchPanel` / `ResultsPanel` / `SourceViewer` / `DatasetStatus` to those endpoints.
5. **OpenClaw:** tools pointing at the statute API for judge demos.

The checklist in [docs/plan.md](docs/plan.md) remains the broader baseline; [docs/phase1_plan.md](docs/phase1_plan.md) narrows Phase 1 to **California-only** `query → result → UI` on statutes.


## Trust & safety

- Every claim traces back to a public URL + paragraph snippet
- Unsupported claims get marked, not hidden
- No legal advice; this is a research prototype

## Disclaimer

Hackathon prototype. Not legal advice. Results limited to indexed public sources.
