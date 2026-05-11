# Phase 1 MVP Plan — California Statute Harvester (Team of 6)

Phase 1 of the post-kickoff build. Goal: ship a queryable, source-grounded **multi-jurisdiction motor-vehicle statute Harvester** that resolves citation lookup and contributing-factor retrieval against the released CA Vehicle Code eval set, and is structurally ready to score against the held-out multi-state set.

Source-of-truth specs:

- Project brief (eval criteria) — the user-facing prompt at kickoff
- Baseline architecture doc (kept locally, not tracked) — module shapes + API contracts
- [eval-ca-vehicle-code.csv](../eval-ca-vehicle-code.csv) — released set: 41 CA Vehicle Code statutes labeled across 17 contributing-factor categories

[docs/plan.md](plan.md) was the pre-kickoff plan written for Variant A (PI Case Comparator on CanLII). The eval drop reframed the problem to **statute lookup**. This document supersedes it for Phase 1.

---

## What's already built

Real code (not stubs):

| File | What it does |
|---|---|
| `backend/main.py` | FastAPI app, CORS, `/healthz`, lifespan calls `init_db()`, mounts `routes_status` + `routes_ingest` |
| `backend/config.py` | `Settings` dataclass; loads `ANTHROPIC_API_KEY`, `DATABASE_URL`, `VECTOR_INDEX_PATH` |
| `backend/db.py` | SQLAlchemy engine + `SessionLocal` + `init_db()` |
| `backend/models.py` | Only the `Document` table — no `chunks` / `metadata` / `claim_support` yet |
| `backend/ingestion/adapters/base.py` | `SearchResult`, `RawDocument`, `SourceAdapter` Protocol |
| `backend/ingestion/adapters/web.py` | `WebAdapter` — Claude `web_search_20250305` for discovery, `httpx` for fetch, raw bytes persisted to disk |
| `backend/ingestion/pipeline.py` | `ingest_search()` orchestrates search → fetch → persist; URL-level dedup |
| `backend/api/routes_ingest.py` | `POST /ingest/search`, `POST /ingest/url` |
| `backend/api/routes_status.py` | `GET /status` returns count + 5 sample URLs |
| `backend/smoke_check.py` | Anthropic + deps smoke test |
| `backend/extraction/schemas.py` | Pydantic schema for **PI case-law extraction** (PICaseFields) — not the Phase-1 schema; reserve for Organizer extension |
| `frontend/app/page.tsx` + `layout.tsx` | Next.js 15 + React 19 + Tailwind 3-column shell |

Stubs only (one-line docstrings or `return null`):

- All of `parsing/*`, `retrieval/*`, `reasoning/*`, `verification/*`
- `extraction/extract.py`, `extraction/prompts.py`
- `ingestion/adapters/canlii.py`, `pdf.py`
- `api/routes_search.py`, `routes_answer.py`, `routes_verify.py`
- All frontend components in `frontend/components/*.tsx`
- `openclaw/agent_prompt.md`, `openclaw/tools.json`

---

## Pivot from the pre-kickoff plan

`extraction/schemas.py` and [docs/plan.md](plan.md) were written for **case-law PI extraction** on CanLII / Ontario. The eval is **statute lookup**, not case-law comparison.

- The Phase-1 schema is `StatuteFields`, **not** `PICaseFields`. Leave `PICaseFields` in the file; reserve it for the Organizer extension.
- CanLII / Ontario goes to the back burner; California Vehicle Code at `leginfo.legislature.ca.gov` is the canonical source.
- `WebAdapter` stays useful for case law / authoritative sources in Phase 2; Phase 1 needs a **statute-specific adapter**.

---

## Definition of done for Phase 1

The phase is done when, on a fresh laptop:

```text
1. `python -m backend.ingestion.run --jurisdiction CA --code VEH` populates the database
2. `uvicorn backend.main:app` boots
3. `npm run dev` boots the frontend
4. A user opens http://localhost:3000, types "reckless driving" in the search box
   → sees § 23103(a) at the top of the results
   → clicks it → sees the full section text in the side viewer
   → clicks "Open on leginfo" → lands on the official CA source page
5. Same flow works for the two other demo queries (citation lookup + factor lookup)
```

**Coverage target:** every citation in `eval-ca-vehicle-code.csv` resolvable, plus full California Vehicle Code "Rules of the Road" + "Driving Offenses" divisions ingested (~1,500 sections).

**Quality bars:**

- Citation lookup recall@1 = 1.0 on the released CSV (deterministic regex fast-path).
- Contributing-factor → statutes recall@5 ≥ 0.85 on the released CSV.
- Top-1 factor-tagger accuracy ≥ 0.80 against the released gold labels.

---

## Phase-1 endpoints (the only ones that matter)

```text
GET  /statutes/{citation}        → one statute by canonical citation
POST /statutes/search            → {query, filters: {factor?}, top_k} → ranked list
GET  /factors                    → 17 categories with statute counts
GET  /status                     → indexed count, last-ingest, last eval score
```

That's it. No `/answer`, no `/verify`, no `/compare`. Reasoning and verification stay as stubs.

---

## Six roles

### Person 1 — Data Lead (CA ingestion)

**Owns:** `backend/ingestion/adapters/ca_statute.py` (new), `backend/ingestion/pipeline.py`, `data/raw/ca_statutes/`, `backend/parsing/html_parse.py`.

**Tasks:**

1. Pick `leginfo.legislature.ca.gov` as the canonical source. URL template: `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum={section}`.
2. Implement `CaStatuteAdapter` against the existing `SourceAdapter` protocol in `adapters/base.py`. `search` walks the Vehicle Code TOC and returns section URLs; `fetch` returns one section's HTML. Polite scraping: 1 req/sec, real User-Agent, retry-on-429, on-disk cache to `data/raw/ca_statutes/{section}.html`.
3. Walk the TOC for **"Rules of the Road" (Division 11) + "Driving Offenses" (Division 11.5)** as the first pass — covers all 41 released CSV citations and most likely held-out queries.
4. Implement `parsing/html_parse.py` to extract from leginfo HTML: section number, subdivision, division, chapter, statute text. Keep paragraph structure where present.
5. Smoke-resolve every citation in `eval-ca-vehicle-code.csv` — all 41 must round-trip from raw HTML through the adapter and parser.
6. Update `backend/ingestion/pipeline.py` to feed parsed statutes into Person 3's `Statute` table (not the generic `Document` table).
7. CLI entry point: `python -m backend.ingestion.run --jurisdiction CA --code VEH`.

**Acceptance:** All 41 released-CSV citations resolvable from `data/raw/ca_statutes/` and visible in the `Statute` table.

---

### Person 2 — Extraction Lead (schema + factor tagger)

**Owns:** `backend/extraction/schemas.py` (extend), `backend/extraction/prompts.py`, `backend/extraction/extract.py`, `backend/extraction/factors.py` (new).

**Tasks:**

1. Add a `StatuteFields` Pydantic model alongside the existing `PICaseFields`. Fields: `jurisdiction`, `code_name`, `section_number`, `universal_citation`, `subdivision`, `division`, `chapter`, `statute_text`, `complete_statute`, `official_url`, `effective_date` (optional), `contributing_factors: list[str]`. Reuse `SourceSupport`.
2. Lock the **17-factor taxonomy** as a `Literal` / `Enum` in `factors.py`, seeded directly from the released CSV: DUI/DWI, Failure to Yield the Right-of-Way, Improper Turning, Reckless Driving, Following Too Closely, Improper Passing, Failure to Maintain Lane, Improper Lane of Travel, Improper Stopping, Improper Starting, Driving Too Fast For Conditions, Failure to Obey Traffic Control Device, Failure to Yield at a Yield Sign, Fleeing a Police Officer, Fleeing the Scene of a Collision, Using a Wireless Telephone/Texting While Driving, Failure to Use/Activate Horn.
3. Implement `extract.py` with one job: a **factor tagger** — Claude Sonnet 4.x tool-use call that takes statute text + the 17-factor taxonomy and returns a list of applicable factors with a `confidence` and a verbatim `quote` per tag. (HTML → `StatuteFields` is deterministic and lives in Person 1's parser; no LLM needed there.)
4. Few-shot prompt in `prompts.py` seeded from **5–10 examples in the released CSV**. Cover the thin-tail singletons explicitly (`Failure to Use/Activate Horn`, `Improper Starting`, `Following Too Closely`) — those are the diagnostic cases for whether the tagger memorized vs generalized.
5. Coordinate with Person 3 on persistence: factor tags land in the `StatuteFactor` table with `(statute_id, factor, confidence, quote)`.
6. Cache extraction outputs to `data/processed/factors/{statute_id}.json` so re-runs are free.

**Acceptance:** `python -m backend.extraction.run --jurisdiction CA` tags every ingested statute. Person 6 reports top-1 factor accuracy ≥ 0.80 on the released 41 rows.

---

### Person 3 — Retrieval Lead (storage + hybrid query)

**Owns:** `backend/models.py` (statute tables), `backend/retrieval/embeddings.py`, `vector_store.py`, `keyword_search.py`, `hybrid_search.py`.

**Tasks:**

1. Add tables to `models.py`:
   - `Statute` — one row per section. Columns: `id`, `statute_id` (stable string, e.g. `ca-veh-22350`), `jurisdiction`, `code_name`, `section_number`, `universal_citation`, `subdivision`, `division`, `chapter`, `statute_text`, `complete_statute`, `official_url`, `retrieved_at`. Unique on `(jurisdiction, code_name, section_number, subdivision)`.
   - `StatuteFactor` — `(statute_id, factor, confidence, quote)`. Many-to-many.
   - Keep `Document` as-is. Skip `Chunk` for Phase 1 — vehicle-code sections are short enough that one section = one retrieval unit.
2. **Keyword search** (`keyword_search.py`): SQLite **FTS5** virtual table over `statute_text` + `complete_statute` + `universal_citation`.
3. **Vector index** (`embeddings.py` + `vector_store.py`): Chroma persistent client at `data/index/`. Embed each statute's `complete_statute` text **prefixed with a one-sentence document-level context** (Anthropic-style contextual retrieval — "This is California Vehicle Code § 22350 in the Rules of the Road division, regulating speed limits"). The prefix is generated once per section in a batch job.
4. **Hybrid retrieval** (`hybrid_search.py`): RRF (reciprocal rank fusion) merge of vector + FTS5. Metadata filter on `factor` is a simple WHERE clause. Citation regex (e.g., `Cal\.?\s*Veh\.?\s*Code\s*§\s*\d+`) hits a deterministic fast path that bypasses retrieval.
5. Public function: `retrieve(query: str, factor: str | None, top_k: int) -> list[StatuteHit]`. Person 4's API routes are thin pass-throughs over this.
6. Publish the retrieval API shape in `backend/retrieval/__init__.py` so everyone agrees on the contract.

**Acceptance:** Citation lookup recall@1 = 1.0, factor → statutes recall@5 ≥ 0.85 against the released CSV (Person 6 runs the eval).

---

### Person 4 — Backend / API Lead (FastAPI routes)

**Owns:** `backend/api/routes_statutes.py` (new — repurpose `routes_search.py`), `backend/api/routes_status.py` (extend), `backend/main.py` (router wiring).

**Tasks:**

1. Implement endpoints:
   - `GET /statutes/{citation}` — exact citation lookup. Normalize citations on input (strip whitespace, decode `§`, accept both `Cal. Veh. Code § 22350` and `22350`). Return 404 with a clean payload if not found.
   - `POST /statutes/search` — body `{query, filters: {factor?}, top_k}` → calls `hybrid_search.retrieve()`.
   - `GET /factors` — returns the 17 categories + statute counts (one query against `StatuteFactor`).
   - Extend `GET /status` to report indexed-statute count, jurisdictions covered (will be just CA for Phase 1), last-ingest timestamp, last eval score.
2. Pydantic response models for all four endpoints in `backend/api/schemas.py` (new). Frontend reads these as the contract.
3. Wire new routers in `backend/main.py` — currently only `routes_status` and `routes_ingest` are mounted.
4. **No** agent / answer / verify endpoints in Phase 1. Leave those modules as stubs.
5. Publish OpenAPI snapshot to `docs/api.md` so Person 5 and Person 6 have a stable reference.

**Acceptance:** All four endpoints return 200 with the documented schema for at least one happy-path test. Person 5's frontend wires against them.

---

### Person 5 — Frontend Lead (the UI loop)

**Owns:** all of `frontend/components/*.tsx`, `frontend/lib/api.ts` (new), `frontend/app/page.tsx` (already laid out — wire data).

**Tasks:**

1. Typed API client in `frontend/lib/api.ts` — `fetch` wrappers, no extra deps. Mirror Person 4's Pydantic shapes as TypeScript types.
2. Replace each `return null` component with a real version:
   - `SearchPanel` — text query box + factor dropdown (the 17 categories from `GET /factors`). Submit fires `POST /statutes/search`. Loading + empty states.
   - `ResultsPanel` — card list of statutes: citation in monospace, complete statute text (truncated with "show more"), factor tags as chips, "Open on leginfo →" link to `official_url`.
   - `DatasetStatus` — pulls `GET /status`, shows indexed count, jurisdictions covered, eval-score badge.
   - `SourceViewer` — clicking a result calls `GET /statutes/{citation}` and shows the full section in a side panel.
   - `ComparisonTable` — return `null` (Organizer feature, Phase 2).
   - `VerificationPanel` — return `null` (Phase 2). Or repurpose as a "source provenance" panel showing "retrieved from {url}, last fetched {date}" if there's time.
3. Citation lookup shortcut: if the user types something that matches the citation regex, route to `GET /statutes/{citation}` directly and skip search.
4. Visual polish enough that judges trust it: the design tokens in baseline §7 are already wired through Tailwind in `app/layout.tsx`. Use the verified-green / amber / red tokens for the factor chips later if helpful.
5. Error states for "no results" and "statute not found" — explicit, not silent.

**Acceptance:** Frontend boots, types in `app/page.tsx` resolve, all three demo-script queries (Person 6 owns the script) render real results from the running backend.

---

### Person 6 — Eval / QA / Demo Lead

**Owns:** `backend/evaluation/` (new), `docs/demo_script.md`, integration smoke tests, calibration of Person 2's tagger, demo dry-runs.

This role exists because **the released CSV is the only quality signal we have** and the demo is half the score. Splitting it off Person 3 (so Retrieval can focus on retrieval) and off Person 5 (so Frontend can focus on UI) buys the team a dedicated quality + demo owner.

**Tasks:**

1. **Eval harness** (`backend/evaluation/run.py`):
   - Load `eval-ca-vehicle-code.csv`.
   - For each row, run two queries:
     - Citation lookup (exact) — expect recall@1 = 1.0.
     - Factor → statutes — query is the contributing-factor name, expected docs are all rows with that label; compute recall@5 + MRR.
   - Run the **factor-tagger eval**: feed the statute text to Person 2's tagger and compare top-1 factor against the gold label. Compute precision / recall per factor; flag thin-tail factors with < 1.0 recall as Person 2's calibration targets.
   - Output: `data/exports/eval_report.json` + a one-page Markdown summary in `docs/eval.md`.
   - CLI: `python -m backend.evaluation.run --suite released`.
2. **Tagger calibration loop with Person 2**: when the tagger over-tags `Reckless Driving` or misses thin-tail factors, ship prompt tweaks back to Person 2's `prompts.py`. Calibrate before the bulk run, not after.
3. **End-to-end smoke test** (`backend/tests/test_e2e.py`): boots the API in-process, hits all four endpoints, asserts the demo queries return expected citations. Run it before every demo.
4. **Demo script** (`docs/demo_script.md`): three queries, all CA-only:
   - **Citation lookup:** type `Cal. Veh. Code § 23152(a)` → § 23152(a) appears at top, leginfo link works.
   - **Factor retrieval:** type `improper passing` (or pick the factor from dropdown) → ranked list including § 21750(a), § 21751, § 21753, § 21754, § 21755(a) from the released CSV.
   - **Free-text:** type `running a red light` → § 21453(a) at top (semantic retrieval; the literal phrase isn't in the statute, so this exercises the vector half of the hybrid).
5. Pre-record fallback screenshots and a 60-second screen recording of every demo query. If the network dies during judging, switch to the recording.
6. **Pitch beats** (5-minute demo): problem (paralegals stitch statute lookups by hand) → what we built (queryable CA Vehicle Code Harvester with factor-aware retrieval, every result traces to `leginfo.ca.gov`) → live demo of all three queries → 30-second close on what's next (multi-state, case law interpreting these sections, NHTSA crash-data joins).
7. Bug triage during the build: on hour 4, hour 8, hour 12, run the smoke test, file the top 3 issues, and pair with whoever owns each.

**Acceptance:** `eval_report.json` shows citation recall@1 = 1.0, factor recall@5 ≥ 0.85, tagger top-1 ≥ 0.80. Demo script committed. Fallback recordings saved. Smoke test green at code-freeze.

---

## Sequencing & dependencies

The hard dependency chain in the first ~3 hours:

```text
T+0:00 — whiteboard sync (everyone, 60 min)
   - Lock the Statute / StatuteFactor schema (Person 3 facilitates)
   - Lock the 17-factor enum (Person 2 facilitates)
   - Lock the API contract (Person 4 facilitates)
   - Lock the leginfo URL template + adapter shape (Person 1 facilitates)
   - Lock the demo queries (Person 6 facilitates)

T+1:00 — schema + enum + API contract published
   ├─→ Person 1 starts CA adapter + parser
   ├─→ Person 2 starts factor tagger against 5 hand-fetched HTML files
   ├─→ Person 3 starts FTS5 + Chroma plumbing
   ├─→ Person 4 starts API skeletons against fixture data
   ├─→ Person 5 starts frontend components against mock fixtures
   └─→ Person 6 writes the eval harness against the released CSV (no live data needed)

T+4:00 — first end-to-end CA ingest run
   ├─→ Person 6 runs the eval harness, reports baseline numbers
   └─→ Person 2 calibrates tagger from Person 6's failure log

T+6:00 — frontend wires against live backend
   └─→ Person 6 runs first end-to-end smoke test of demo queries

T+8:00 — code freeze on schema + API; only bug fixes after this
   └─→ Person 6 runs final smoke test, locks fallback recordings
```

Everyone unblocks each other if **schema + factor enum + API contract are agreed in the first 60 minutes** before anyone writes implementation code. Spend the first hour on a whiteboard, not in the editor.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `leginfo` HTML structure varies between divisions | Medium | Test parser against 5 sections from different divisions before bulk-ingesting; Person 1 owns this |
| Factor tagger over-tags `Reckless Driving` (the broadest category) | Medium | Person 6 calibrates against thin-tail singletons in the released CSV before the bulk run; require a verbatim quote per tag |
| Phase-1 scope creep into multi-state / agent / case law | High | Hard line: CA only, web UI only, no agent layer. Anyone who finishes early helps Person 6 with eval calibration or Person 5 with UI polish |
| `/statutes/{citation}` URL-encoding pain (citations contain `§`, spaces, parens) | Medium | Person 4 normalizes citations on input; expose `?q=` alternative; document the canonical form in `docs/api.md` |
| Some CSV citations are subdivision-specific (e.g., `21451(a)` and `21451(b)`) | High | Schema must support `subdivision` as a separate field. Lookup `Cal. Veh. Code § 21451(a)` returns just the (a) row, not the parent. Person 1 + Person 3 align on this in the kickoff sync |
| Held-out eval includes a state we didn't ingest | Medium-High | Phase-1 demo openly says CA-only; the existing `WebAdapter` is a fallback for live ingestion. **Multi-state is the #1 Phase-2 priority precisely because of this** |
| Tagger calls eat the API budget | Low | Cache extraction outputs to `data/processed/`; use Sonnet 4.x not Opus; batch where possible |
| Frontend stalls waiting for live backend | Medium | Person 5 builds against mock fixtures matching Person 4's Pydantic shapes; switches to live API at T+6 |

---

## Out of scope for Phase 1 (deliberate)

Held back so Phase 1 actually ships:

- **Multi-state expansion** — TX, NY, FL vehicle codes. **#1 Phase-2 priority.**
- **Agent layer** — `openclaw/agent_prompt.md` and `tools.json` stay empty. Phase-2 priority #2 (after multi-state).
- **Case law interpreting statutes** — Organizer extension, Phase 2.
- **NHTSA / CDC / OSHA dataset joins** — Phase 2 stretch.
- **Per-claim verification badges** (`VerificationPanel`) — answers in Phase 1 are retrieved statutes, not generated prose, so verification is structurally simpler. Becomes meaningful in Phase 2 when the agent generates prose answers.
- **`ComparisonTable`** — Organizer feature.
- **The Negotiator agent** — Phase 3+.
- **`reasoning/*` and `verification/*` modules** — leave as stubs.

If the team finishes Phase 1 before the budget, the rank-ordered next moves are:

1. **Add Texas Transportation Code** (Person 1's CA adapter is the template; Person 6 reruns the eval harness on TX-flavored queries).
2. **Wire agent layer** — `tools.json` declaring `lookup_statute_by_citation`, `search_statutes_by_factor`, `search_statutes_by_text`; agent prompt forces tool use.
3. **Add NY Vehicle and Traffic Law.**

---

## Phase 1 acceptance checklist

Definition-of-done is hit when **every** box below is checked.

### Data + extraction
- [ ] `CaStatuteAdapter` ingests CA Vehicle Code Divisions 11 + 11.5 (~1,500 sections)
- [ ] All 41 released-CSV citations resolvable from `data/raw/ca_statutes/`
- [ ] `Statute` table populated with ≥1,500 CA sections, each with `official_url`
- [ ] Every statute has at least one `StatuteFactor` row
- [ ] Top-1 factor-tagger accuracy ≥ 0.80 on the released 41 rows

### Retrieval + API
- [ ] FTS5 + Chroma both populated and queryable
- [ ] `hybrid_search.retrieve()` returns recall@5 ≥ 0.85 on factor → statutes
- [ ] Citation regex fast-path returns recall@1 = 1.0
- [ ] `GET /statutes/{citation}`, `POST /statutes/search`, `GET /factors`, `GET /status` all return 200 with documented payloads
- [ ] OpenAPI snapshot in `docs/api.md`

### Frontend
- [ ] All 4 in-scope components render real data (`SearchPanel`, `ResultsPanel`, `DatasetStatus`, `SourceViewer`)
- [ ] Citation regex shortcut works (typing `Cal. Veh. Code § 23152(a)` in the search box jumps straight to the section)
- [ ] Factor dropdown populated from `GET /factors`
- [ ] "Open on leginfo →" link visible on every result and lands on the official source
- [ ] Loading + empty + error states present

### Eval + demo
- [ ] `python -m backend.evaluation.run --suite released` exits 0 and writes `eval_report.json`
- [ ] All three demo queries return correct results live
- [ ] Fallback screen recordings saved for each demo query
- [ ] `docs/demo_script.md` committed
- [ ] Smoke test (`backend/tests/test_e2e.py`) green at code-freeze

### Trust + safety
- [ ] Every statute row has a real `official_url` pointing at `leginfo.legislature.ca.gov`
- [ ] UI footer carries the not-legal-advice disclaimer (already present in `app/page.tsx`)
