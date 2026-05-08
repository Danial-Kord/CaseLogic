# EvenUp x OpenClaw Hackathon

A 24-hour build targeting a personal-injury legal research stack. Turn scattered public data (court records, government datasets, open web) into something a PI attorney would actually use — source-grounded, verifiable, no fabrication.

Full spec: [openclaw_hackathon_baseline_architecture.md](openclaw_hackathon_baseline_architecture.md).

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

## Trust & safety

- Every claim traces back to a public URL + paragraph snippet
- Unsupported claims get marked, not hidden
- No legal advice; this is a research prototype

## Disclaimer

Hackathon prototype. Not legal advice. Results limited to indexed public sources.
