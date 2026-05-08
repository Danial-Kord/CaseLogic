# EvenUp x OpenClaw Hackathon

A 24-hour build targeting a personal-injury legal research stack. Turn scattered public data (court records, government datasets, open web) into something a PI attorney would actually use — source-grounded, verifiable, no fabrication.

Full spec: [openclaw_hackathon_baseline_architecture.md](openclaw_hackathon_baseline_architecture.md).

For a short cheat sheet on adapters, extraction/retrieval/reasoning/verification, and OpenClaw’s role, see **Architecture Q&A** below (after the kickoff checklist).

**Phased prep plan with technology guide:** [docs/plan.md](docs/plan.md).

## Current state

**Pre-kickoff scaffolding only.** Every module file contains a one-line docstring and nothing else. No logic is implemented yet — that happens at kickoff once the eval set drops.

## Repo layout

```
.env.example              ANTHROPIC_API_KEY, DATABASE_URL, VECTOR_INDEX_PATH
requirements.txt          fastapi, anthropic, chromadb, sqlalchemy, ...
package.json              placeholder; frontend toolchain not yet picked

backend/                  Python package — FastAPI app
  main.py                 app entry
  config.py / db.py       runtime config + SQLAlchemy session
  models.py               documents / chunks / metadata / claim_support tables
  ingestion/              fetch + orchestrate
    pipeline.py
    adapters/             base, canlii, web, pdf
  parsing/                clean_text, chunk, pdf_parse, html_parse
  extraction/             schemas, extract, prompts
  retrieval/              embeddings, vector_store, keyword_search, hybrid_search
  reasoning/              answer, compare, summarize
  verification/           claims, verify, citations
  api/                    routes_ingest, routes_search, routes_answer, routes_verify, routes_status

openclaw/                 agent_prompt.md, tools.json, config.example.json
frontend/src/             App.tsx + components/ (placeholder TSX, no toolchain yet)
data/                     raw/, processed/, exports/, index/  (.gitkeep only)
docs/                     architecture.md, demo_script.md, design_notes.md
```

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
cp .env.example .env      # then fill in ANTHROPIC_API_KEY
```

## TODO — implement at kickoff

Pre-kickoff (safe to do before eval drops):
- [ ] Pick the variant from Section 9 of the baseline doc (PI comparator / citation verifier / intake assistant / trend analyzer / records research)
- [ ] Pick one jurisdiction + one source type (avoid Failure Mode 3: too broad)
- [ ] Decide vector DB (default: Chroma)
- [ ] Initialize frontend toolchain (Vite + React + TS recommended)
- [ ] Assign team roles per Section 16 (data / extraction / retrieval / agent-backend / product-demo)

Backend modules to implement:
- [ ] `backend/main.py` — FastAPI app, mount routers
- [ ] `backend/config.py` — load env vars
- [ ] `backend/db.py` + `backend/models.py` — SQLAlchemy engine + 4 tables
- [ ] `backend/ingestion/adapters/*` — start with one (web or canlii)
- [ ] `backend/ingestion/pipeline.py` — fetch → parse → chunk → extract → index
- [ ] `backend/parsing/*` — html_parse + clean_text first; pdf_parse if needed
- [ ] `backend/parsing/chunk.py` — paragraph-preserving chunker
- [ ] `backend/extraction/schemas.py` — Pydantic models for chosen variant
- [ ] `backend/extraction/extract.py` — Anthropic-based structured extraction
- [ ] `backend/retrieval/embeddings.py` + `vector_store.py` — Chroma index
- [ ] `backend/retrieval/keyword_search.py` + `hybrid_search.py` — combined ranking
- [ ] `backend/reasoning/answer.py` + `compare.py` + `summarize.py`
- [ ] `backend/verification/claims.py` + `verify.py` + `citations.py`
- [ ] `backend/api/routes_*.py` — wire endpoints from Section 6

OpenClaw agent:
- [ ] `openclaw/agent_prompt.md` — paste the baseline system prompt from Section 10
- [ ] `openclaw/tools.json` — declare search_documents, get_document, extract_fields, compare_documents, verify_claims, show_sources

Frontend:
- [ ] `npm create vite` (or chosen alternative) inside `frontend/`
- [ ] Wire components: SearchPanel, ResultsPanel, ComparisonTable, VerificationPanel, SourceViewer, DatasetStatus

Demo & polish (Hours 18–24):
- [ ] Dataset status panel
- [ ] 3 demo queries rehearsed
- [ ] Fallback screenshots in case live demo breaks
- [ ] Pitch + 30-second value framing

## Architecture Q&A (guidance)

Short answers for common “what does this module do?” questions. The authoritative detail stays in [openclaw_hackathon_baseline_architecture.md](openclaw_hackathon_baseline_architecture.md).

### What is `backend/ingestion/adapters/*` — start with one (web or CanLII)?

These are **source-specific connectors** that fetch public material (HTML/PDF/metadata) and hand it to `pipeline.py` (fetch → parse → chunk → extract → index). Stubs today: `base.py`, `web.py`, `canlii.py`, `pdf.py`.

**Start with one adapter** to avoid Failure Mode 3 (too broad): implement it end-to-end through the pipeline before adding others.

- **Web** — arbitrary public URLs; flexible but you own fetch policy, parsing quirks, and robots/terms compliance.
- **CanLII** — Canadian case law from a single well-defined public corpus; good when jurisdiction + source type are fixed.

### What is `backend/extraction/schemas.py` — Pydantic models for chosen variant?

**Typed shapes for structured extraction** (injuries, damages, parties, deadlines—whatever matches the **one** hackathon variant you pick in baseline Section 9). They validate LLM/rule output, serialize into storage (`metadata.schema_name` / `fields_json`), and align with the `extract_fields` API (`fields`, `confidence`, ideally `source_support` with URL + quote + paragraph). Implement models for **your** variant only, not every column in the baseline’s example table.

### What do extraction + retrieval + reasoning + verification modules do?

**Extraction**

- `schemas.py` — Pydantic models for extracted fields.
- `extract.py` — Anthropic-based structured extraction over **supplied** source text only; output should include traceability (`source_support`), not facts from model memory.

**Retrieval**

- `embeddings.py` + `vector_store.py` — embed chunks and persist a **Chroma** index; IDs must tie back to documents/chunks and URLs.
- `keyword_search.py` + `hybrid_search.py` — lexical search plus fusion with vectors and metadata filters (addresses Failure Mode 4: pure vector misses exact phrases).

**Reasoning** (Module 8)

- `answer.py`, `compare.py`, `summarize.py` — synthesize **retrieved** evidence into answers, comparisons, and digests; avoid introducing uncited facts.

**Verification** (Module 9)

- `claims.py` — represent or extract atomic claims from an answer.
- `verify.py` — match claims to snippets; label `verified` / `partial` / `unsupported` with URLs and reasons.
- `citations.py` — citation formatting and consistency with source metadata for UI/agent.

End-to-end flow: ingest → chunk → **extract** → index (**embeddings** + **vector_store**) → **keyword** + **hybrid** search → **answer / compare / summarize** → **claims + verify + citations**.

### Where does OpenClaw fit?

**OpenClaw is the conversational orchestration layer on top of the backend**, not a substitute for `backend/`.

- Baseline **Module 10**: the agent uses **tools** (`search_documents`, `get_document`, `extract_fields`, `compare_documents`, `verify_claims`, `show_sources`, …) instead of inventing legal facts.
- Those tools map to **FastAPI** routes under `backend/api/` (baseline Section 6 / Module 11).
- Repo wiring lives in **`openclaw/`** (`agent_prompt.md`, `tools.json`, `config.example.json`).

FastAPI implements capabilities; OpenClaw decides **when** to call them and how to present results in chat, still grounded in retrieved sources and verification.

## Trust & safety

- Every claim traces back to a public URL + paragraph snippet
- Unsupported claims get marked, not hidden
- No legal advice; this is a research prototype

## Disclaimer

Hackathon prototype. Not legal advice. Results limited to indexed public sources.
