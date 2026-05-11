# Phase 2 — Complete corpus + measurable retrieval

> **Roadmap**
>
> | Phase | Theme | Status | Doc |
> |---|---|---|---|
> | 1 | Statute search loop (CA VEH, query → result → UI) | **Shipped on `main`** | [phase1_plan.md](phase1_plan.md) |
> | 2 | Complete corpus + measurable retrieval | **In progress (this doc)** | [phase2.md](phase2.md) |
> | 3 | Source-grounded reasoning + verification | Pending | [phase3.md](phase3.md) |
> | 4 | Agent wiring + demo polish + freeze | Pending | [phase4.md](phase4.md) |
>
> Source of truth for module shapes: baseline architecture doc (kept locally, not tracked).
> This doc is the **owner + sequencing** layer over that.

---

## Where Phase 1 actually landed

Verified by reading the tree, not by trust:

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
  - `GET /healthz`, `GET /status`, `GET /factors`, `GET /statutes/{id}`,
    `POST /statutes/search` (factor filter wired).
- Frontend wired against the real backend: `SearchPanel`, `ResultsPanel`,
  `SourceViewer`, `DatasetStatus`. Mock mode opt-in via `NEXT_PUBLIC_MOCK_MODE`.
- 15/15 smoke tests green
  ([`backend/tests/test_retrieval_api.py`](../backend/tests/test_retrieval_api.py)).
- CORS permissive on `localhost`/`127.0.0.1` for any dev port.

**Carried into Phase 2**

- `app.db` currently has 25 of 41 CSV rows — needs a clean re-ingest.
- Division 11 + 11.5 walk pipeline exists but hasn't been exercised end-to-end.
- LLM-based factor tagger (`extract.py`, `prompts.py`) is empty. Only relevant
  for the non-CSV statutes from the division walk.
- No eval harness *producer*; `routes_status.py` already reads `eval_report.json`
  but nobody writes it.
- No `division` / `chapter` / `subdivision_only` filters on `/statutes/search`.

---

## Phase 2 deliverable (definition of done)

```
> GET /status
{
  "indexed_statutes": 1500+,
  "indexed_documents": 1+,
  "jurisdictions": ["CA"],
  "last_eval_recall_at_5": 0.82,
  "last_eval_run_at": "2026-..."
}

> POST /statutes/search { "query":"defendant ran a red light", "factor":"Disregarded Traffic Signal", "division":"11" }
→ returns the right CA VEH §21453(a) snippets in the top 5
```

Concretely: a real corpus (~1500 statutes), recall@5 ≥ 0.8 reported by an actual
harness (not a hard-coded number), and every filter dimension wired through.

---

## Workload split

Three owners. Person 4 + Person 5 are heads-down on Phase 3 prep during this
window (see [phase3.md](phase3.md)).

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
(retrieval index needs every row).
**Blocked by:** nothing.
**Done when:** `GET /status` reports both `indexed_statutes ≥ 1500` *and* the
41 eval rows are present, and re-running ingest is a no-op.

---

### Person 2 — Extraction Lead

**Goal:** every statute that came through the division walk (no CSV label)
gets ≥1 factor tag from the 17-factor taxonomy, with a verbatim quote.

> The CSV's 41 rows already get their `StatuteFactor` rows from the
> `Contributing Factor` column at ingest time. The LLM tagger is now scoped to
> the **non-CSV statutes** (division-walk output), which is where it actually
> adds value.

- [ ] **Few-shot prompt** in [`backend/extraction/prompts.py`](../backend/extraction/prompts.py):
  - 5 worked examples spanning at least 4 distinct factors. Lift the examples
    from the released CSV — that's a known-good label set.
  - Output format = Claude tool use with a Pydantic schema (one tool call returns
    `[{factor, confidence, quote}]`).
  - System prompt enforces: no factors not in
    [`backend.extraction.factors.FACTORS`](../backend/extraction/factors.py),
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
  misdemeanor) from each section — useful filter for Phase-3 `/compare`.

**Files:** [backend/extraction/extract.py](../backend/extraction/extract.py),
[backend/extraction/prompts.py](../backend/extraction/prompts.py),
[backend/extraction/factors.py](../backend/extraction/factors.py).

**Blocks:** Person 3 (factor-filtered retrieval over the full corpus).
**Blocked by:** Person 1 (division walk complete).
**Done when:** every Statute has ≥1 factor tag, every tag has a quote that
substring-matches the source, calibration accuracy ≥80%.

---

### Person 3 — Retrieval Lead

**Goal:** retrieval is good enough that a fact pattern surfaces the right
sections in the top 5, **measured by an actual eval harness** instead of vibes.

> Phase 1 already shipped: build CLI, RRF wiring, deterministic contextual
> prefix, citation fast-path, factor filter. Phase 2's retrieval work is now
> (a) measure it, (b) widen filters, (c) optionally add query rewrite — in
> that order of priority.

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
- [ ] **Filters wired through to API**:
  - Today: `factor` filter only.
  - Add: `division`, `chapter`, `subdivision_only` (true → only rows where
    `subdivision IS NOT NULL`). Update [`backend/api/schemas.py`](../backend/api/schemas.py)
    `StatuteSearchRequest` and the SQL pre-filter in
    [`backend/retrieval/hybrid_search.py`](../backend/retrieval/hybrid_search.py).
- [ ] **Optional LLM contextual prefix** (Anthropic-style contextual retrieval):
  the deterministic prefix already in
  [`embeddings.py`](../backend/retrieval/embeddings.py) may be enough. If
  recall@5 < 80%, add an LLM-generated one-sentence prefix per statute, cache
  to `data/processed/prefixes.jsonl`, re-embed.
- [ ] **Optional query expansion**: an LLM rewrite step in
  `hybrid_search.retrieve()` that emits 3–5 query variants ("running a red
  light" → "stopping at red signal", "violation of §21453", "duty to stop at
  intersection"). Union the variant hits before RRF. Gate behind a feature
  flag — only enable if eval shows it helps.
- [ ] **Reranker (optional, only if precision is weak)**: top-50 hybrid →
  Claude reranks by relevance to the fact pattern → top-10. Skip unless eval
  says so.

**Files:** [backend/retrieval/embeddings.py](../backend/retrieval/embeddings.py),
[backend/retrieval/hybrid_search.py](../backend/retrieval/hybrid_search.py),
[backend/api/schemas.py](../backend/api/schemas.py),
new `backend/evaluation/recall.py`.

**Blocks:** Phase 3 (`/answer` is only as good as retrieval).
**Blocked by:** Person 2 (full-corpus factor tags), but the eval harness can
land against the 41-row CSV corpus today.
**Done when:** eval harness writes `eval_report.json`, recall@5 ≥ 0.8 on the
eval set, all four filter dimensions wired.

---

## Critical sequencing

```
Hour 0:  Person 1 starts division walk (~40 min unattended) ───┐
         Person 3 starts the eval harness against the 41 CSV rows
         Person 2 starts on prompts (using the CSV as known-good examples)

Hour 1:  Person 3 has eval baseline (recall@5 on the 41-row corpus)
         Person 1's walk still running

Hour 2:  Person 1 division walk completes (~1500 statutes in DB)
         Person 2 starts bulk extraction (haiku is cheap)
         Person 3 reindexes + adds the new filters

Hour 4:  Person 2 done (full corpus tagged), Person 3 reindexed
         Eval harness re-runs against the full 1500-statute corpus
         Phase 2 done → Phase 3 starts
```

Person 4 + Person 5 are simultaneously prepping Phase 3 (reading the
Phase 3 plan, stubbing the new endpoints, sketching the Comparison /
Verification UIs against fakes). They don't depend on this phase finishing
to start — see [phase3.md](phase3.md).

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Division walk has worse parser coverage than the CSV path | Medium | Person 1 spot-checks 20 `.invalid` markers; Person 3 verifies recall@5 holds on a mix of CSV-sourced and walk-sourced rows. |
| LLM factor extraction quality varies by section length | Medium | Person 2 splits very long sections by subdivision before extraction; calibration pass with 30 samples. |
| Hybrid retrieval scores are mis-calibrated (vector dominates) | Medium | Person 3's eval harness exposes this directly; tune RRF k-constant if recall@5 lags. |
| Scope creep into a second jurisdiction | High | Stretch only. Phase 2 ships CA only. |

---

## Phase 2 acceptance check

```bash
# Corpus is real
curl -s localhost:8000/status | jq '{indexed_statutes, last_eval_recall_at_5}'
#  Expect: indexed_statutes ≥ 1500, last_eval_recall_at_5 ≥ 0.8

# All Statutes have ≥1 factor tag
curl -s localhost:8000/factors | jq '[.factors[] | select(.statute_count == 0)] | length'
#  Expect: low (the 17-factor taxonomy may have a couple of zero-count edges)

# New filters work
curl -s -X POST localhost:8000/statutes/search \
  -H "Content-Type: application/json" \
  -d '{"query":"red light","division":"11","subdivision_only":true,"top_k":5}' \
  | jq '.results[].statute_id'
#  Expect: only ca-veh-...-{a-z} rows from Division 11

# Re-running ingest is a no-op
python -m backend.ingestion.run --jurisdiction CA --code VEH | grep -E "skipped|inserted"
#  Expect: skipped == total, inserted == 0
```

If all four return sensible output, Phase 2 ships and Phase 3 takes over.
