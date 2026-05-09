# Phase 2 — Implementation Plan (5-person team)

## Where Phase 1 actually landed

Status snapshot on `main` (verified by reading the tree, not by trust):

**Done**

- `Statute` + `StatuteFactor` ORM models with cascading delete + a unique
  `(jurisdiction, code_name, section_number, subdivision)` constraint.
- CSV-driven ingest at [`backend/ingestion/pipeline.py`](../backend/ingestion/pipeline.py)
  — parses leginfo HTML, persists statutes, **and tags `StatuteFactor` rows
  from the CSV's `Contributing Factor` column** (idempotent backfill on re-run).
- Slug generation is canonical: one `make_statute_id` in
  [`backend/retrieval/__init__.py`](../backend/retrieval/__init__.py); ingest
  delegates to it. Decimal sections (`§ 2800.1(a)`) and bare letters
  (`subdivision='a'`, not `'(a)'`) all consistent.
- Hybrid retrieval: Chroma persistent client + SQLite FTS5 + RRF (k=60) +
  citation fast-path. Index-build CLI (`python -m backend.retrieval.build`)
  is idempotent.
- Four Phase-1 endpoints serving end-to-end:
  - `GET /healthz`
  - `GET /status`         → `{indexed_documents, indexed_statutes, jurisdictions, last_eval_*}`
  - `GET /factors`        → 17 categories with statute counts (zero-counts kept)
  - `GET /statutes/{id}`  → 200/400/404
  - `POST /statutes/search` → citation fast-path + RRF; `factor` filter wired
- Frontend wired against the real backend: `SearchPanel`, `ResultsPanel`,
  `SourceViewer`, `DatasetStatus`. Mock mode opt-in via `NEXT_PUBLIC_MOCK_MODE`.
- 15/15 smoke tests green
  ([`backend/tests/test_retrieval_api.py`](../backend/tests/test_retrieval_api.py)).
- CORS permissive on `localhost`/`127.0.0.1` for any dev port.

**Partial / carried into Phase 2**

- Corpus is small (currently 25 of 41 CSV rows in the user's `app.db` — needs
  a clean re-ingest). Division 11 + 11.5 walk pipeline exists but hasn't been
  exercised end-to-end.
- LLM-based factor tagger ([`extract.py`](../backend/extraction/extract.py),
  [`prompts.py`](../backend/extraction/prompts.py)) is empty. Only relevant
  for the non-CSV statutes from the division walk.
- No eval harness *producer*; the `/status` endpoint reads `eval_report.json`
  but nobody writes it.
- Phase-2 frontend components (`ComparisonTable`, `VerificationPanel`) are
  still `return null`. `ChatPanel.tsx` is implemented (8 KB) but not mounted.
- `docs/demo_script.md` is a one-line header.
- `openclaw/tools.json` = `{"tools": []}`, `agent_prompt.md` is a header.

Source of truth for module shapes: [../openclaw_hackathon_baseline_architecture.md](../openclaw_hackathon_baseline_architecture.md).
This file is the **owner + sequencing** layer over that.

---

## Phase 2 deliverable (definition of done)

```
> POST /answer  { "query": "rear-end collision at red light, defendant texting; CA" }

→ retrieves CA VEH §22350 (basic speed), §21453 (red light), §23123 (handheld), and
  any matching subdivisions ranked by hybrid score
→ Claude synthesizes a fault-and-causation analysis grounded in those sections
→ each factual claim carries [cite: ca-veh-21453-a, ¶...] + a verification badge
→ frontend renders results table + comparison view + verification panel + source
  viewer with paragraph anchors back to leginfo
```

A judge can: type a fact pattern, get an answer, click a citation, land on the
exact paragraph in the source viewer, and see green/amber/red badges.

---

## Workload split

Each owner has ~6–10 hours of focused work. Many tasks are independently shippable
behind fakes — see "Critical sequencing" for what must land first.

### Person 1 — Data Lead

**Goal:** the corpus is correct, complete, and traceable.

- [ ] **Clean re-ingest of the CSV path**: drop `app.db`, drop `data/index/`,
  re-run `python -m backend.ingestion.run --jurisdiction CA --code VEH --csv-only`,
  then `python -m backend.retrieval.build`. Verify `GET /factors` shows
  non-zero counts for ≥10 categories and that all 41 eval rows landed.
- [ ] **Full Division 11 + 11.5 walk** (drop `--csv-only`):
  - Runs `ingest_ca_vehicle_code_divisions` for Div 11 (21000–23336) and
    11.5 (23500–23675). First run takes ~40 min at 1 req/sec; subsequent runs
    are instant from `data/raw/ca_statutes/` cache.
  - Sample 20 sections marked `.invalid` on disk — confirm leginfo really
    has no content there (vs. parser miss). File issues per false negative.
  - These statutes have **no Contributing Factor labels** — Person 2 fills
    them in via the LLM tagger.
- [ ] **Dedup + URL canonicalization**:
  - Re-run the ingest twice; second run should be all-skip with zero new
    rows (the unique constraint already enforces this; this just verifies it).
  - Canonicalize trailing slashes / casing on `official_url`.
- [ ] **Web ingestion polish** ([`backend/ingestion/adapters/web.py`](../backend/ingestion/adapters/web.py)):
  - Add 429 backoff (httpx returns 429 → wait, retry once with jitter).
  - Capture `<title>` from fetched HTML when the title was missing in the
    search result; today many `Document` rows have `title=null`.
- [ ] **Optional stretch**: a second jurisdiction (e.g. NY VTL §1180–1183 for
  speed/right-of-way analogues). Only if the primary corpus is solid.

**Files:** [backend/ingestion/adapters/ca_statute.py](../backend/ingestion/adapters/ca_statute.py),
[backend/ingestion/adapters/web.py](../backend/ingestion/adapters/web.py),
[backend/ingestion/pipeline.py](../backend/ingestion/pipeline.py).

**Blocks:** Person 2 (LLM tagger needs the post-walk corpus), Person 3
(retrieval index needs every row), Person 6 if they exist (eval harness on
the released CSV's 41 rows).
**Blocked by:** nothing.
**Done when:** `GET /status` reports both `indexed_statutes ≥ 1500`
*and* the 41 eval rows are present, and re-running ingest is a no-op.

---

### Person 2 — Extraction Lead

**Goal:** every statute that came through the division walk (no CSV label)
gets ≥1 factor tag from the 17-factor taxonomy, with a verbatim quote.

> **Re-scope from the original Phase-2 plan:** the CSV's 41 rows already get
> their `StatuteFactor` rows from the `Contributing Factor` column at ingest
> time. The LLM tagger is now scoped to the **non-CSV statutes** (division-walk
> output), which is where it actually adds value.

- [ ] **Few-shot prompt** in [`backend/extraction/prompts.py`](../backend/extraction/prompts.py):
  - 5 worked examples spanning at least 4 distinct factors. Lift the examples
    from the released CSV — that's a known-good label set.
  - Output format = Claude tool use with a Pydantic schema (one tool call returns
    `[{factor, confidence, quote}]`).
  - System prompt enforces: no factors not in [`backend.extraction.factors.FACTORS`](../backend/extraction/factors.py),
    quotes must be substrings of the input statute, confidence in [0,1].
- [ ] **Extractor** in [`backend/extraction/extract.py`](../backend/extraction/extract.py):
  - `extract_statute_factors(statute: Statute) -> list[StatuteFactor]`
  - Validates LLM output against the locked taxonomy + substring rule. Drop
    tags that fail validation; log them rather than failing the whole call.
  - Use `claude-haiku-4-5` for cost. Bump to Sonnet only if a sample shows
    haiku misses important factors.
- [ ] **Bulk extraction job** `python -m backend.extraction.run_all`:
  - Walks every `Statute` whose `factors` is empty. Idempotent: skip statutes
    with ≥1 existing tag unless `--force`.
  - Persist per-statute timing + token cost to `data/processed/extraction_log.jsonl`.
  - **Don't overwrite the CSV-sourced labels.** They came from the released
    eval set and are ground truth for those 41 rows.
- [ ] **Calibration pass**: spot-check 30 LLM-tagged statutes by hand. Record
  disagreements; if accuracy <80%, tighten the prompt before running on the
  full corpus.
- [ ] **Stretch**: extract `severity_level` (administrative / infraction /
  misdemeanor) from each section — useful filter for Person 4's compare endpoint.

**Files:** [backend/extraction/extract.py](../backend/extraction/extract.py),
[backend/extraction/prompts.py](../backend/extraction/prompts.py),
[backend/extraction/factors.py](../backend/extraction/factors.py).

**Blocks:** Person 3 (factor-filtered retrieval over the full corpus, not
just the eval CSV).
**Blocked by:** Person 1 (division walk complete).
**Done when:** every Statute has ≥1 factor tag, every tag has a quote that
substring-matches the source, calibration accuracy ≥80%.

---

### Person 3 — Retrieval Lead

**Goal:** retrieval is good enough that a fact pattern surfaces the right
sections in the top 5, **measured by an actual eval harness** instead of vibes.

> **Re-scope from the original Phase-2 plan:** the build CLI, RRF wiring, and
> deterministic contextual prefix already exist. Phase 2's retrieval work
> is now (a) measure it, (b) widen filters, (c) add query rewrite — in that
> order of priority.

- [ ] **Eval harness** ([`backend/evaluation/recall.py`](../backend/evaluation/recall.py),
  doesn't exist yet):
  - Reads `eval-ca-vehicle-code.csv`. For each row, builds a fact-pattern-style
    query from `Statute Language` + `Contributing Factor`. Calls
    `retrieve(query, top_k=10)`. Records whether the expected `statute_id` is
    in the top-5 / top-10.
  - Outputs `data/exports/eval_report.json` with shape
    `{run_at, citation_recall_at_1, factor_recall_at_5, per_query: [...]}`.
    `routes_status.py` already reads this file, so the moment you write it,
    the frontend `DatasetStatus` shows the recall@5 number.
  - CLI: `python -m backend.evaluation.recall`.
- [ ] **Optional LLM contextual prefix** (Anthropic-style contextual retrieval):
  the deterministic prefix already in [`embeddings.py`](../backend/retrieval/embeddings.py)
  may be enough. If recall@5 < 80%, add an LLM-generated one-sentence prefix
  per statute, cache to `data/processed/prefixes.jsonl`, re-embed.
- [ ] **Query expansion**: an LLM rewrite step in `hybrid_search.retrieve()`
  that emits 3–5 query variants ("running a red light" → "stopping at red
  signal", "violation of §21453", "duty to stop at intersection"). Union the
  variant hits before RRF. Gate behind a feature flag — only enable if eval
  shows it helps.
- [ ] **Filters wired through to API**:
  - Today: `factor` filter only.
  - Add: `division`, `chapter`, `subdivision_only` (true → only rows where
    `subdivision IS NOT NULL`). Person 4 surfaces these in the request schema.
- [ ] **Reranker (optional, only if precision is weak)**: top-50 hybrid →
  Claude reranks by relevance to the fact pattern → top-10. Skip unless eval
  says so.

**Files:** [backend/retrieval/embeddings.py](../backend/retrieval/embeddings.py),
[backend/retrieval/hybrid_search.py](../backend/retrieval/hybrid_search.py),
new `backend/evaluation/recall.py`.

**Blocks:** Person 4 (`/answer` is only as good as retrieval).
**Blocked by:** Person 2 (full-corpus factor tags), but the eval harness can
land against the 41-row CSV corpus today.
**Done when:** eval harness writes `eval_report.json`, recall@5 ≥ 80% on the
eval set, index rebuild is one command.

---

### Person 4 — Agent / Backend Lead

**Goal:** turn retrieval into source-grounded answers, comparisons, and
verification — exposed as both REST endpoints and OpenClaw tools.

This person owns the largest amount of net-new code in Phase 2. Everything in
[`backend/reasoning/`](../backend/reasoning/) and
[`backend/verification/`](../backend/verification/) is currently a 1-line
stub.

- [ ] **`POST /answer`** ([`backend/api/routes_answer.py`](../backend/api/routes_answer.py),
  [`backend/reasoning/answer.py`](../backend/reasoning/answer.py)):
  - Run hybrid retrieval (top 8). Build a Claude prompt with the retrieved
    snippets + factor tags + paragraph anchors.
  - **Hard rule** in the system prompt: every factual claim must end with
    `[cite: <statute_id>, ¶<para>]`. No bare claims allowed.
  - Return `{ answer: str, claims: [{text, cites: [...]}], retrieved: [...] }`.
- [ ] **`POST /compare`** ([`backend/reasoning/compare.py`](../backend/reasoning/compare.py)):
  - Input: a fact pattern + 2–N statute IDs. Output: a row-per-statute table of
    `{element_required, supporting_text, factors, would_apply: yes/no/maybe}`.
  - This powers Person 5's `ComparisonTable`.
- [ ] **`POST /verify`** ([`backend/api/routes_verify.py`](../backend/api/routes_verify.py),
  [`backend/verification/{claims,verify,citations}.py`](../backend/verification/)):
  - `claims.py`: split an answer into atomic claims. Regex over `[cite: ...]`
    is fine; LLM split is overkill.
  - `verify.py`: for each claim, fetch the cited statute, ask Claude
    `verified | partial | unsupported | contradicted` + reason. Persist into
    a `claim_support` table — add it to [`backend/models.py`](../backend/models.py).
  - `citations.py`: canonicalize citation strings (`ca-veh-21453-a` ↔
    `§21453(a)` ↔ `California Vehicle Code §21453(a)`). Reuse the existing
    `parse_citation` from `backend.retrieval` rather than reinventing.
- [ ] **OpenClaw wiring** ([`openclaw/agent_prompt.md`](../openclaw/agent_prompt.md),
  [`openclaw/tools.json`](../openclaw/tools.json) — both currently empty):
  - Tools: `search_statutes`, `get_statute`, `compare_statutes`, `answer_with_sources`,
    `verify_claims`, `show_sources`. Each is a thin wrapper over a FastAPI route.
  - System prompt: paste baseline Section 10, customize for CA VEH and the
    verification rules above.
- [ ] **Critical agent rule (paste verbatim into the prompt)**: *If a claim has
  no supporting source, mark it unsupported. Do not silently drop it. The judges
  will test this with a pathological query.*

**Files:** [backend/api/routes_answer.py](../backend/api/routes_answer.py),
[backend/api/routes_verify.py](../backend/api/routes_verify.py),
[backend/reasoning/](../backend/reasoning/),
[backend/verification/](../backend/verification/),
[openclaw/](../openclaw/),
[backend/models.py](../backend/models.py) (for `claim_support`),
[backend/main.py](../backend/main.py) (mount the new routers).

**Blocks:** Person 5 (frontend wires to these endpoints).
**Blocked by:** Person 3 (retrieval quality), Person 2 (factor tags surface
in prompts).
**Done when:** `/answer`, `/compare`, `/verify` all return well-typed JSON;
an OpenClaw chat session can call all six tools and produce a verified answer.

---

### Person 5 — Product / Demo Lead

**Goal:** a judge looking at the screen for 30 seconds can see *what was
searched, what was answered, what's verified*.

> **Re-scope from the original Phase-2 plan:** `DatasetStatus` and `SourceViewer`
> are already done in Phase 1. `ChatPanel.tsx` is implemented but not mounted
> in `app/page.tsx`. The actual Phase-2 work is `ComparisonTable`,
> `VerificationPanel`, mounting `ChatPanel`, and the demo polish.

- [ ] **`ComparisonTable.tsx`** — wire to `POST /compare`. One column per
  statute, one row per element. Background-tint cells by `would_apply`
  (`brand.verified` / `brand.warning` / `brand.error` / `brand.muted` from
  [tailwind.config.ts](../frontend/tailwind.config.ts)). Today it's a 5-line
  `return null` stub.
- [ ] **`VerificationPanel.tsx`** — render `/verify` output as a list of
  claims with badges. Same brand palette. Today it's a 9-line `return null`
  stub.
- [ ] **Mount `ChatPanel.tsx`** in [`frontend/app/page.tsx`](../frontend/app/page.tsx):
  the component itself is built (8 KB, real markdown rendering, source
  attribution UI, mock-mode handling). Page just needs to render it,
  conditionally toggle between search-grid mode and chat mode, and call
  `api.chat()` (which today wraps `/statutes/search` — Person 4 will swap
  in `/answer` once it lands).
- [ ] **`SourceViewer` paragraph anchors**: the component renders the full
  statute text today. Phase-2 task: when the user clicks a `[cite: ¶3]`
  badge in the verification panel, scroll the source viewer to paragraph 3.
  Means splitting `statute_text` on paragraph breaks and adding `id="p3"`
  anchors per paragraph.
- [ ] **Loading / empty / error states** for the new endpoints, matching the
  conventions used by `ResultsPanel` / `SourceViewer` today.
- [ ] **Demo script** ([`docs/demo_script.md`](demo_script.md), currently a
  1-line header) — three queries exercising different strengths:
  1. Pure retrieval ("running a red light in CA")
  2. Compare ("rear-end at red light vs. failure to yield")
  3. Verification stress test ("the defendant exceeded 200 mph" — should
     surface as `unsupported`)
- [ ] **Fallback screenshots** for each demo query in `docs/demo_fallback/`.
  If the network dies at hour 23, this is the demo.
- [ ] **Pitch beats** (60s): problem (PI fault analysis is paywalled / slow) →
  what's locked behind paywalls → 30-second value framing → live query.
- [ ] **Test deps**: Jest is configured in
  [frontend/jest.config.js](../frontend/jest.config.js) and tests exist for
  every component, but `package.json` is missing
  `@testing-library/react`, `@testing-library/user-event`,
  `@testing-library/jest-dom`, `@types/jest`, `babel-jest`,
  `@babel/preset-{env,react,typescript}`. Add them so `npx jest` actually runs.

**Files:** [frontend/components/ComparisonTable.tsx](../frontend/components/ComparisonTable.tsx),
[frontend/components/VerificationPanel.tsx](../frontend/components/VerificationPanel.tsx),
[frontend/components/SourceViewer.tsx](../frontend/components/SourceViewer.tsx),
[frontend/app/page.tsx](../frontend/app/page.tsx),
[frontend/lib/api.ts](../frontend/lib/api.ts),
[frontend/lib/types.ts](../frontend/lib/types.ts),
[docs/demo_script.md](demo_script.md).

**Blocks:** none — demo is the last thing.
**Blocked by:** Person 4 endpoints. While those land, build against fakes
(extend the mock-mode block in `lib/api.ts`) so the UI styles in parallel.
**Done when:** all three demo queries run end-to-end on the laptop, no console
errors, screenshots saved, `npx jest` is green.

---

## Critical sequencing

```
Hour 0:  Person 1 starts division walk (~40 min unattended)──┐
         Person 2 starts on prompts against the 41 CSV rows  │
         Person 3 starts the eval harness                    │
         Person 4 stubs out /answer + /compare + /verify     │
         Person 5 builds ComparisonTable + VerificationPanel │
                                                             ▼
Hour 1:  Person 3 has eval baseline against the 41 CSV rows
         Person 4 has empty endpoints returning {} (so 5 can wire)
         Person 5 swaps mocks for the empty real endpoints
Hour 2:  Person 1 division walk completes (~1500 statutes in DB)
         Person 2 starts bulk extraction (haiku is cheap)
         Person 3 reindexes
Hour 4:  Person 2 done (full corpus tagged), Person 3 reindexed
         Person 4 fleshes out /answer with real Claude calls
Hour 6:  Person 4 done, all three reasoning endpoints returning real data
         Person 5 polishes the comparison + verification UI on real data
Hour 7:  Eval pass; iterate on top 3 failures (Person 3+4)
Hour 8:  Demo rehearsal x3, fallback screenshots, freeze
```

The Phase-1 leftovers (`docs/demo_script.md` empty, missing test deps,
optional NY corpus) get done in the gaps between blocking work. Person 5's
"build against fakes" still removes Person 4 from the critical path for the
first 4 hours.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Division walk has worse parser coverage than the CSV path | Medium | Person 1 spot-checks 20 `.invalid` markers; Person 3 verifies recall@5 holds on a mix of CSV-sourced and walk-sourced rows. |
| LLM factor extraction quality varies by section length | Medium | Person 2 splits very long sections by subdivision before extraction; calibration pass with 30 samples. |
| Hybrid retrieval scores are mis-calibrated (vector dominates) | Medium | Person 3's eval harness exposes this directly; tune RRF k-constant if recall@5 lags. |
| Verification flags everything as `unsupported` | Medium | Person 4: calibrate the verifier prompt with 5 known-good + 5 known-bad pairs before running broadly. |
| Frontend breaks at hour 7 | Medium | Person 5: fallback screenshots + a "demo mode" env var (`NEXT_PUBLIC_MOCK_MODE` already exists) that loads pre-recorded responses. |
| Scope creep into a second jurisdiction | High | Stretch only. Phase 2 ships CA only. |
| Pre-commit/CI gate doesn't catch frontend type drift | Low | `npx tsc --noEmit` and `npx jest` both clean before each push (Person 5 unblocks Jest by adding the missing deps). |

---

## What we are deliberately NOT doing in Phase 2

- **PI Case Comparator on case law** — we pivoted to statute-grounded fault
  analysis. The Pydantic schemas in
  [`backend/extraction/schemas.py`](../backend/extraction/schemas.py) remain
  available for a Phase 3 case-law extension but are dormant for now.
- **Multi-jurisdictional retrieval** — single jurisdiction is the line.
- **Fine-tuning, custom embeddings, RAGAS as a dependency** — see
  [plan.md "Explicitly skipped"](plan.md).
- **Replacing the deterministic contextual prefix with an LLM-generated one**
  unless eval shows it's needed. The current prefix in `embeddings.py`
  (jurisdiction + code + section + division + chapter + body) is good enough
  for short statute corpora, costs nothing to recompute, and re-indexing
  is free.

---

## Cross-cutting acceptance check

Before declaring Phase 2 done, run this script:

```bash
# 1. Corpus
curl -s localhost:8000/status | jq '{indexed_documents, indexed_statutes, last_eval_recall_at_5}'
#    Expect: indexed_statutes ≥ 1500, last_eval_recall_at_5 ≥ 0.8

# 2. Retrieval (already passing on Phase-1 main)
curl -s -X POST localhost:8000/statutes/search \
  -H "Content-Type: application/json" \
  -d '{"query":"rear-end collision at red light, defendant texting","top_k":5}' \
  | jq '.results[].statute_id'

# 3. Reasoning (Phase-2 net-new)
curl -s -X POST localhost:8000/answer \
  -H "Content-Type: application/json" \
  -d '{"query":"rear-end collision at red light, defendant texting; CA"}' \
  | jq '.claims[] | {text, cites}'

# 4. Verification (Phase-2 net-new)
curl -s -X POST localhost:8000/verify \
  -H "Content-Type: application/json" \
  -d '{"answer":"...", "cites":[...]}' \
  | jq '.[] | {claim, status}'

# 5. Pathological query (verification stress test)
curl -s -X POST localhost:8000/answer \
  -H "Content-Type: application/json" \
  -d '{"query":"the defendant exceeded 200 mph in a school zone in CA"}' \
  | jq '.claims[] | select(.cites == [])'
#    Should NOT be empty — unsupported claims must be listed, not hidden.
```

If all five return sensible output, ship it.
