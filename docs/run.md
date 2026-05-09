# Running the stack end-to-end

Step-by-step to bring up the FastAPI backend with real CA Vehicle Code data
and point the Next.js frontend at it (i.e. `MOCK_MODE` off).

> **Prereqs:** Python 3.11+, Node 20+. macOS / Linux paths shown; Windows users
> swap `source .venv/bin/activate` for `.venv\Scripts\activate`.

---

## 1. Backend — one-time setup

From the repo root (`/CaseLogic`):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # ANTHROPIC_API_KEY can stay blank for Phase 1
```

`ANTHROPIC_API_KEY` is **only** needed for the legacy `POST /ingest/search`
(Claude `web_search` tool). The CA statute pipeline scrapes leginfo over plain
HTTP and Chroma embeds locally with `all-MiniLM-L6-v2` — no API key required.

---

## 2. Ingest CA Vehicle Code statutes

For the demo, `--csv-only` is enough — it pulls the 41 eval citations
(~37 HTTP requests, ~30 sec). The full Division 11 + 11.5 walk takes ~40 min
on a cold cache and is only needed for held-out queries.

```bash
# Fast: just the 41 eval citations
python3 -m backend.ingestion.run --jurisdiction CA --code VEH --csv-only

# Slow but complete (cached after first run)
python3 -m backend.ingestion.run --jurisdiction CA --code VEH
```

Writes:

- `app.db` — SQLite at the repo root, with the `statutes` and `statute_factors` tables populated
- `data/raw/ca_statutes/{section}.html` — cached source pages (skip on rerun)

---

## 3. Build retrieval indices

```bash
python3 -m backend.retrieval.build
# or to wipe and rebuild Chroma:
python3 -m backend.retrieval.build --reset
```

Writes:

- `data/index/` — Chroma persistent collection
- An FTS5 virtual table inside `app.db`

---

## 4. Run the backend

```bash
uvicorn backend.main:app --reload
```

Server binds to `http://localhost:8000`. CORS allows `http://localhost:3000`
(hardcoded in `backend/main.py`).

### Smoke-test the API

```bash
curl -s http://localhost:8000/healthz
# {"ok": true}

curl -s http://localhost:8000/status | python3 -m json.tool
# indexed_statutes should be 41 (or ~1500 after the full walk)

curl -s http://localhost:8000/factors | python3 -m json.tool
# All 17 factors with statute_count

curl -s http://localhost:8000/statutes/ca-veh-23152-a | python3 -m json.tool
# StatuteOut for "Cal. Veh. Code § 23152(a)"

curl -s -X POST http://localhost:8000/statutes/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"reckless driving","top_k":5}' | python3 -m json.tool
# Hybrid-search results
```

`http://localhost:8000/docs` gives the interactive OpenAPI UI.

---

## 5. Frontend — point at the live backend

```bash
cd frontend
npm install                       # first time only
```

**Default behavior is already correct** — `NEXT_PUBLIC_MOCK_MODE` is unset in
committed code, so the frontend hits `http://localhost:8000`. To stay in mock
mode, copy `.env.local.example` to `.env.local`. To go live, **don't** create
`.env.local` (or set `NEXT_PUBLIC_MOCK_MODE=false`).

```bash
npm run dev                       # http://localhost:3000
```

---

## 6. End-to-end smoke flow

With both servers running:

1. Open <http://localhost:3000>
2. Header should show `41 statutes indexed · California` (no eval badge yet —
   the harness hasn't run; `data/exports/eval_report.json` will populate it)
3. Type `reckless driving` → result cards appear with citation, factor chip,
   `matched_via` badge
4. Click a result → `SourceViewer` opens with full statute, "Show full
   context" disclosure, "Open on leginfo →" link
5. Type `Cal. Veh. Code § 23152(a)` → citation hint appears; submit jumps
   straight to the statute via the slug fast-path (no `/search` round-trip)
6. Type `Cal. Veh. Code § 99999` → 404 from `/statutes/{slug}` falls back to
   `/search`, shows the empty-results state

---

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `Backend offline` in header | uvicorn isn't running, or port 3000 blocked by CORS | Restart uvicorn; confirm CORS origin in `backend/main.py` |
| `0 statutes indexed` | Ingestion didn't run or ran into HTTP failures | Re-run `python3 -m backend.ingestion.run --csv-only` and watch logs |
| Search returns empty for known queries | Index out of sync after re-ingest | `python3 -m backend.retrieval.build --reset` |
| Citation fast-path 404s on a real citation | `parseCitationToSlug` grammar drift vs `parse_citation` on backend | Falls back to `/search` automatically — but worth comparing slug formats once the backend is up |
| Frontend still shows mock data | `NEXT_PUBLIC_MOCK_MODE=true` in `frontend/.env.local` | Delete `.env.local` or set the var to `false`; restart `npm run dev` |
