# Phase 2 — Implementation Plan (5-person team)

Phase 1 landed: ingestion (CA Vehicle Code via leginfo + web fallback via Claude
`web_search`), persistence (`Document`, `Statute`, `StatuteFactor` tables), retrieval
plumbing (embeddings, vector store, FTS5 keyword, hybrid fusion), and a Next.js
search UI wired to `/statutes/search`.

Phase 2 turns the corpus into a **reasoning + verification system**: a fact pattern
in, a source-grounded analysis with paragraph-anchored citations and per-claim
verification badges out. Plus the demo polish needed to ship.

Source of truth for module shapes: [../openclaw_hackathon_baseline_architecture.md](../openclaw_hackathon_baseline_architecture.md).
This file is the **owner + sequencing** layer over that.

---

## Phase 2 deliverable (definition of done)

```
> POST /answer  { "query": "rear-end collision at red light, defendant texting; CA" }

→ retrieves CA VEH §22350 (basic speed), §21453 (red light), §23123 (handheld), and
  any matching subdivisions ranked by hybrid score
→ Claude synthesizes a fault-and-causation analysis grounded in those sections
→ each factual claim carries [cite: ca-veh-21453(a), ¶...] + a verification badge
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

**Goal:** the corpus is correct, complete, and traceable. Nothing downstream
matters if the source data is wrong.

- [ ] **Coverage audit** of the CA VEH division walk:
  - Run `ingest_ca_vehicle_code_divisions` for Div 11 (21000–23336) and 11.5
    (23500–23675). Log into `data/processed/ingestion_report.json`.
  - For sections marked `.invalid` on disk, sample 20 — confirm leginfo really
    has no content (vs. parser miss). File issues per false negative.
- [ ] **Dedup + URL canonicalization**:
  - One `Statute` row per `(jurisdiction, code_name, section_number, subdivision)`.
    Verify the unique constraint actually fires by re-running the ingest twice;
    second run should be all-skip.
  - Canonicalize trailing slashes / casing on `official_url`.
- [ ] **Web ingestion polish** (`backend/ingestion/adapters/web.py`):
  - Add 429 backoff (httpx returns 429 → wait, retry once with jitter).
  - Capture `<title>` from fetched HTML when title was missing in the search
    result; today many `Document` rows have `title=null`.
- [ ] **Source health endpoint**: `GET /status` already counts docs; extend to
  return `{statutes: count, documents: count, last_ingested_at, divisions_covered}`.
  Person 5 will surface this in `DatasetStatus`.
- [ ] **Optional stretch**: a second jurisdiction (e.g. NY VTL §1180–1183 for
  speed/right-of-way analogues). Only if the primary corpus is solid.

**Files:** [backend/ingestion/adapters/ca_statute.py](../backend/ingestion/adapters/ca_statute.py),
[backend/ingestion/adapters/web.py](../backend/ingestion/adapters/web.py),
[backend/ingestion/pipeline.py](../backend/ingestion/pipeline.py),
[backend/api/routes_status.py](../backend/api/routes_status.py).

**Blocks:** Person 2 (extraction needs the full statute set), Person 3
(retrieval index needs every row).
**Blocked by:** nothing.
**Done when:** `GET /status` reports the expected count for both divisions, and
re-running ingest is a no-op.

---

### Person 2 — Extraction Lead

**Goal:** every statute is tagged with the right factors from the 17-factor
taxonomy, with a verbatim quote backing each tag.

- [ ] **Few-shot prompt** in [`backend/extraction/prompts.py`](../backend/extraction/prompts.py):
  - 5 worked examples spanning at least 4 distinct factors.
  - Output format = Claude tool use with a Pydantic schema (one tool call returns
    `[{factor, confidence, quote}]`).
  - System prompt enforces: no factors not in [`backend.extraction.factors.FACTORS`](../backend/extraction/factors.py),
    quotes must be substrings of the input statute, confidence in [0,1].
- [ ] **Extractor** in [`backend/extraction/extract.py`](../backend/extraction/extract.py):
  - `extract_statute_factors(statute: Statute) -> list[StatuteFactor]`
  - Validates LLM output against taxonomy + substring rule. Drop tags that fail
    validation; log them for review rather than failing the whole call.
  - Use `claude-haiku-4-5` for cost (full corpus is small). Bump to Sonnet only
    if a sample shows haiku misses important factors.
- [ ] **Bulk extraction job**:
  - `python -m backend.extraction.run_all` walks every persisted Statute, calls
    the extractor, persists `StatuteFactor` rows. Idempotent: skip statutes
    whose `factors` already have ≥1 row unless `--force`.
  - Persist per-statute timing + token cost to `data/processed/extraction_log.jsonl`.
- [ ] **Calibration pass**: spot-check 30 statutes by hand. Record disagreements;
  if accuracy <80%, tighten the prompt before running on the full corpus.
- [ ] **Stretch**: extract a `severity_level` (administrative / infraction /
  misdemeanor) from each section — useful filter for Person 4's compare endpoint.

**Files:** [backend/extraction/extract.py](../backend/extraction/extract.py),
[backend/extraction/prompts.py](../backend/extraction/prompts.py),
[backend/extraction/factors.py](../backend/extraction/factors.py),
[backend/models.py](../backend/models.py).

**Blocks:** Person 3 (factor-filtered retrieval needs `StatuteFactor` populated),
Person 4 (`/answer` reasoning surfaces factor tags in the prompt).
**Blocked by:** Person 1 (corpus complete).
**Done when:** every Statute has ≥1 factor tag, every tag has a quote that
substring-matches the source.

---

### Person 3 — Retrieval Lead

**Goal:** retrieval is good enough that a fact pattern surfaces the right sections
in the top 5. Today's hybrid_search.py is wired but unevaluated.

- [ ] **Index-build CLI** ([`backend/retrieval/build.py`](../backend/retrieval/build.py)
  is partially there): `python -m backend.retrieval.build --reindex`. Embeds every
  Statute (use `complete_statute`, not just `statute_text` — the surrounding
  context lifts recall meaningfully).
- [ ] **Embedding contextual prefix** (Anthropic-style contextual retrieval):
  for each statute, generate a one-sentence prefix like
  `"CA Vehicle Code §21453(a) — duty at a red light. Part of Division 11, Chapter 2."`
  Embed `prefix + statute_text`. Cache prefixes to `data/processed/prefixes.jsonl`
  so re-indexing doesn't re-call Claude.
- [ ] **Query expansion**: an LLM rewrite step in `hybrid_search.search()` that
  emits 3–5 query variants ("running a red light" → "stopping at red signal",
  "violation of §21453", "duty to stop at intersection"). Union the variant hits
  before fusion.
- [ ] **Filters wired through to API**: `factors=[...]`, `division=...`,
  `subdivision_only=true|false`. Person 4 will surface these in the request schema.
- [ ] **Reranker (optional)**: top-50 hybrid → Claude reranks → top-10. Skip
  unless the eval shows recall is solid but precision is weak.
- [ ] **Recall@k smoke set**: 10 fact patterns + expected statute IDs in
  `backend/evaluation/recall_smoke.json`. Run before/after each change.

**Files:** [backend/retrieval/build.py](../backend/retrieval/build.py),
[backend/retrieval/embeddings.py](../backend/retrieval/embeddings.py),
[backend/retrieval/vector_store.py](../backend/retrieval/vector_store.py),
[backend/retrieval/keyword_search.py](../backend/retrieval/keyword_search.py),
[backend/retrieval/hybrid_search.py](../backend/retrieval/hybrid_search.py).

**Blocks:** Person 4 (`/answer` needs reliable retrieval), Person 5 (results UI
shows scores + filters).
**Blocked by:** Person 1 (corpus), Person 2 (factor filters need tags).
**Done when:** recall@5 ≥ 80% on the smoke set; index rebuild is one command.

---

### Person 4 — Agent / Backend Lead

**Goal:** turn retrieval into source-grounded answers, comparisons, and
verification — exposed as both REST endpoints and OpenClaw tools.

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
  - `claims.py`: split an answer into atomic claims (regex over `[cite: ...]` is
    fine; LLM split is overkill).
  - `verify.py`: for each claim, fetch the cited statute, ask Claude
    `verified | partial | unsupported | contradicted` + reason, persist into
    `claim_support` table (add it to [`backend/models.py`](../backend/models.py) if not yet).
  - `citations.py`: canonicalize citation strings (`ca-veh-21453-a` ↔ `§21453(a)` ↔
    `California Vehicle Code §21453(a)`).
- [ ] **OpenClaw wiring** ([`openclaw/agent_prompt.md`](../openclaw/agent_prompt.md),
  [`openclaw/tools.json`](../openclaw/tools.json)):
  - Tools: `search_statutes`, `get_statute`, `compare_statutes`, `answer_with_sources`,
    `verify_claims`, `show_sources`. Each is a thin wrapper over a FastAPI route.
  - System prompt: paste baseline Section 10, customize for CA VEH and the
    verification rules above.
- [ ] **Critical agent rule (paste verbatim into the prompt)**: *If a claim has
  no supporting source, mark it unsupported. Do not silently drop it. The judges
  will test this with a pathological query.*

**Files:** all of [backend/api/](../backend/api/),
[backend/reasoning/](../backend/reasoning/),
[backend/verification/](../backend/verification/),
[openclaw/](../openclaw/).

**Blocks:** Person 5 (frontend wires to these endpoints).
**Blocked by:** Person 3 (retrieval), Person 2 (factor tags surface in prompts).
**Done when:** `/answer`, `/compare`, `/verify` all return well-typed JSON; an
OpenClaw chat session can call all six tools and produce a verified answer.

---

### Person 5 — Product / Demo Lead

**Goal:** a judge looking at the screen for 30 seconds can see *what was
searched, what was answered, what's verified*.

- [ ] **Complete the components** ([frontend/components/](../frontend/components/)):
  - `DatasetStatus.tsx` — fetch `/status`, render statute count + last-ingested-at
    + a green dot when verification mode is on.
  - `ComparisonTable.tsx` — wire to `/compare`. One column per statute, one row
    per element. Background-tint cells by `would_apply` (green/amber/red/gray).
  - `VerificationPanel.tsx` — render `/verify` output as a list of claims with
    badges (palette already in `tailwind.config.ts`: `brand.verified`,
    `brand.warning`, `brand.error`, `brand.muted`).
  - `SourceViewer.tsx` — given a `statute_id`, fetch full statute, render with
    paragraph numbers, scroll to the cited paragraph when a claim is clicked,
    and link out to `official_url` (the leginfo URL).
  - `ChatPanel.tsx` — minimal OpenClaw chat that POSTs to a dev `/openclaw/chat`
    proxy or directly to the agent loop.
- [ ] **Loading / empty / error states** for every fetch. Today most components
  silently render nothing while the request is in flight.
- [ ] **Demo script** ([`docs/demo_script.md`](demo_script.md)) — three queries
  exercising different strengths:
  1. Pure retrieval ("running a red light in CA")
  2. Compare ("rear-end at red light vs. failure to yield")
  3. Verification stress test ("the defendant exceeded 200 mph" — should
     surface as unsupported)
- [ ] **Fallback screenshots** for each demo query in `docs/demo_fallback/`. If
  the network dies at hour 23, this is the demo.
- [ ] **Pitch beats** (60s): problem (PI fault analysis is paywalled / slow) →
  what's locked behind paywalls → 30-second value framing → live query.
- [ ] **Disclaimer in UI footer** is already present; verify it survives the
  refactor.

**Files:** all of [frontend/components/](../frontend/components/),
[frontend/app/page.tsx](../frontend/app/page.tsx),
[frontend/lib/api.ts](../frontend/lib/api.ts),
[frontend/lib/types.ts](../frontend/lib/types.ts),
[docs/demo_script.md](demo_script.md).

**Blocks:** none — demo is the last thing.
**Blocked by:** Person 4 endpoints. While those land, build against fakes
(hardcoded JSON in `lib/api.ts`) so the UI can be styled in parallel.
**Done when:** all three demo queries run end-to-end on the laptop, no console
errors, screenshots saved.

---

## Critical sequencing

```
Hour 0:     Person 1 starts coverage audit ──┐
            Person 5 starts UI work against fakes ──── (parallel)
Hour 1:     Person 2 starts on prompts (using a hand-picked sample) ──┐
            Person 3 starts on contextual prefixes (cache locally) ───┤
Hour 2:     Person 1 done → Person 2 runs bulk extraction
                          → Person 3 runs full reindex
Hour 4:     Person 2 done, Person 3 done
            Person 4 starts /answer + /compare + /verify
Hour 6:     Person 4 done → Person 5 swaps fakes for real endpoints
Hour 7:     Eval pass + iterate on top 3 failures
Hour 8:     Demo rehearsal x3, fallback screenshots, freeze
```

Person 5's "build against fakes" is the unlock — it removes the dependency on
Person 4 from the critical path.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Claude `web_search` returns commentary URLs, not primary sources | Medium | Person 1: bias the search prompt toward `site:leginfo.legislature.ca.gov`. Add a `source_priority` filter at retrieval time. |
| Factor extraction quality varies by section length | Medium | Person 2: split very long sections by subdivision before extraction. |
| Hybrid retrieval scores are mis-calibrated (vector dominates) | Medium | Person 3: tune RRF k-constant; verify with smoke set before declaring done. |
| Verification flags everything as `unsupported` | Medium | Person 4: calibrate the verifier prompt with 5 known-good + 5 known-bad pairs before running broadly. |
| Frontend breaks at hour 7 | Medium | Person 5: fallback screenshots + a "demo mode" env var that loads pre-recorded responses from `frontend/lib/demo-data.ts`. |
| Scope creep into a second jurisdiction | High | Stretch only. Phase 2 ships CA only. |

---

## What we are deliberately NOT doing in Phase 2

- **PI Case Comparator on case law** — we pivoted to statute-grounded fault
  analysis. The Pydantic schemas in [`backend/extraction/schemas.py`](../backend/extraction/schemas.py)
  remain available for a Phase 3 case-law extension but are dormant for now.
- **Multi-jurisdictional retrieval** — single jurisdiction is the line.
- **Fine-tuning, custom embeddings, RAGAS as a dependency** — see
  [plan.md "Explicitly skipped"](plan.md).

---

## Cross-cutting acceptance check

Before declaring Phase 2 done, run this script (Person 4 owns):

```bash
# 1. Corpus
curl -s localhost:8000/status | jq '.indexed_documents, .indexed_statutes'

# 2. Retrieval
curl -s -X POST localhost:8000/statutes/search \
  -H "Content-Type: application/json" \
  -d '{"query":"rear-end collision at red light, defendant texting","top_k":5}' \
  | jq '.results[].statute_id'

# 3. Reasoning
curl -s -X POST localhost:8000/answer \
  -H "Content-Type: application/json" \
  -d '{"query":"rear-end collision at red light, defendant texting; CA"}' \
  | jq '.claims[] | {text, cites}'

# 4. Verification
curl -s -X POST localhost:8000/verify \
  -H "Content-Type: application/json" \
  -d '{"answer":"...", "cites":[...]}' \
  | jq '.[] | {claim, status}'

# 5. Pathological query (verification stress test)
curl -s -X POST localhost:8000/answer \
  -H "Content-Type: application/json" \
  -d '{"query":"the defendant exceeded 200 mph in a school zone in CA"}' \
  | jq '.claims[] | select(.cites == [])'   # should NOT be empty — unsupported claims must be listed
```

If all five return sensible output, ship it.
