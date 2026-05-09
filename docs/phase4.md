# Phase 4 — OpenClaw + demo polish + freeze

> **Roadmap**
>
> | Phase | Theme | Status | Doc |
> |---|---|---|---|
> | 1 | Statute search loop (CA VEH, query → result → UI) | **Shipped on `main`** | [phase1_plan.md](phase1_plan.md) |
> | 2 | Complete corpus + measurable retrieval | Pending | [phase2.md](phase2.md) |
> | 3 | Source-grounded reasoning + verification | Pending | [phase3.md](phase3.md) |
> | 4 | OpenClaw wiring + demo polish + freeze | **This doc** | [phase4.md](phase4.md) |
>
> Source of truth for module shapes: [../openclaw_hackathon_baseline_architecture.md](../openclaw_hackathon_baseline_architecture.md).

---

## Phase 4 deliverable (definition of done)

A judge can:

1. Open the OpenClaw chat layer and type a fact pattern.
2. Watch the agent call `search_statutes` → `get_statute` → `answer_with_sources`
   → `verify_claims` → `show_sources`, all wrapping our FastAPI routes.
3. See an answer with `[cite: ca-veh-21453-a, ¶1]` markers, click one, land
   on that paragraph in the source viewer, and see green / amber / red
   verification badges.
4. Run our pre-rehearsed three-query demo script start to finish in under
   3 minutes, with no console errors.
5. If the network dies, fall back to the screenshot deck in
   `docs/demo_fallback/` — same content, no live calls.

Code is frozen at hour 22; only bug fixes after that.

---

## What's already in place vs. what's net-new

**In place after Phase 3**

- `POST /answer`, `POST /compare`, `POST /verify` are real and well-typed.
- Frontend components render real responses; `ChatPanel` is mounted; cites
  are clickable; verification badges show.

**Stubs to fill**

| File | Today | Phase 4 task |
|---|---|---|
| [`openclaw/tools.json`](../openclaw/tools.json) | `{"tools": []}` | 6 tool declarations |
| [`openclaw/agent_prompt.md`](../openclaw/agent_prompt.md) | one-line header | Full system prompt customized for CA VEH |
| [`openclaw/config.example.json`](../openclaw/config.example.json) | empty `{}` | Real example config (model, base URL, tool routing) |
| [`docs/demo_script.md`](demo_script.md) | one-line header | Three rehearsed queries + expected outputs |
| `docs/demo_fallback/` | doesn't exist | Screenshots of every demo step |
| [`frontend/package.json`](../frontend/package.json) | missing test deps | Add `@testing-library/*`, `babel-jest`, presets so `npx jest` runs |

---

## Workload split

This is a smaller phase than 2 or 3 — most owners are wrapping up Phase-3 work
in parallel with these tasks. Treat the bullet list below as a checklist, not
strict ownership.

### Person 4 — OpenClaw wiring

**Goal:** the OpenClaw agent can do everything the REST API can do.

- [ ] **Tool declarations** in [`openclaw/tools.json`](../openclaw/tools.json):
  six tools, each a thin wrapper over an existing FastAPI route.
  - `search_statutes(query, factor?, division?, top_k?)` → `POST /statutes/search`
  - `get_statute(statute_id)` → `GET /statutes/{statute_id}`
  - `compare_statutes(fact_pattern, statute_ids)` → `POST /compare`
  - `answer_with_sources(query)` → `POST /answer`
  - `verify_claims(answer, cites)` → `POST /verify`
  - `show_sources(statute_ids)` → multi-fetch wrapper over `GET /statutes/{id}`
- [ ] **System prompt** in [`openclaw/agent_prompt.md`](../openclaw/agent_prompt.md):
  start from baseline doc Section 10, then customize:
  - Specify CA Vehicle Code as the only authoritative source.
  - Name the 17 contributing factors so the model can use them.
  - **Paste verbatim**: *If a claim has no supporting source, mark it
    unsupported. Do not silently drop it.*
  - Mandate the workflow: retrieve → answer → verify → present. No answering
    from model memory.
- [ ] **Example config** in [`openclaw/config.example.json`](../openclaw/config.example.json):
  the model slug we're using, the FastAPI base URL, and the tool routing.
  Document required env vars in the README.
- [ ] **Smoke a full agent loop** end-to-end: a single OpenClaw chat session
  asks "rear-end at red light, defendant texting; CA" and the agent calls all
  six tools in sequence, returning a verified answer. Capture the trace; it
  becomes part of the demo.

**Files:** [openclaw/tools.json](../openclaw/tools.json),
[openclaw/agent_prompt.md](../openclaw/agent_prompt.md),
[openclaw/config.example.json](../openclaw/config.example.json),
[README.md](../README.md).

**Blocked by:** Phase 3 endpoints all live.
**Done when:** the trace above completes cleanly and the agent never produces
a claim without `[cite: ...]`.

---

### Person 5 — Demo polish

**Goal:** the 3-minute pitch is rehearsed, and a network outage at hour 23
doesn't kill the demo.

- [ ] **Demo script** in [`docs/demo_script.md`](demo_script.md). Three
  queries, in order, exercising different strengths:
  1. **Pure retrieval** — *"running a red light in CA"*. Expects
     `ca-veh-21453(a)` in the top 3 hits.
  2. **Compare** — *"compare §21453(a) and §21801 for an intersection
     collision"*. Expects a 2-row comparison table with overlapping factors
     highlighted.
  3. **Verification stress test** — *"the defendant exceeded 200 mph"*.
     Expects at least one claim flagged `unsupported` (this is the judge-bait
     test).
  Each query gets: query string, expected statute IDs, expected verification
  badges, and a one-sentence "what this proves about our system".
- [ ] **Fallback screenshots** in `docs/demo_fallback/`. PNG per step of each
  demo query: empty page → query typed → results loaded → cite clicked →
  verification panel populated. If the laptop loses network, point a browser
  at the screenshot deck and narrate.
- [ ] **`MOCK_MODE` parity**: confirm `NEXT_PUBLIC_MOCK_MODE=1` in
  [`frontend/lib/api.ts`](../frontend/lib/api.ts) returns the *same* shape as
  the real endpoints for all three demo queries. This is the second-line
  fallback (UI runs locally, no backend needed).
- [ ] **Pitch beats** (60 seconds). Outline only — don't memorize a script.
  - **Problem**: PI fault analysis is paywalled, slow, and error-prone.
  - **What's locked behind paywalls** today: statute-by-factor lookup,
    cross-section comparison, citation verification.
  - **What we built**: a free, source-grounded statute reasoner with
    per-claim verification.
  - **Live query**: pick the most photogenic of the three (usually the
    compare).
- [ ] **Test deps**: Jest is configured in `frontend/jest.config.js` and
  tests exist for every component, but `package.json` is missing
  `@testing-library/react`, `@testing-library/user-event`,
  `@testing-library/jest-dom`, `@types/jest`, `babel-jest`,
  `@babel/preset-env`, `@babel/preset-react`, `@babel/preset-typescript`.
  Add them so `npx jest` actually runs (a CI badge in the README is a cheap
  trust signal for judges).
- [ ] **Disclaimer in UI footer** is already present from Phase 1; verify
  it survived all the Phase-3 refactors.

**Files:** [docs/demo_script.md](demo_script.md),
new `docs/demo_fallback/`,
[frontend/lib/api.ts](../frontend/lib/api.ts),
[frontend/package.json](../frontend/package.json),
[README.md](../README.md).

**Blocked by:** Phase 3 frontend complete.
**Done when:** all three queries run end-to-end on the laptop with no
console errors, screenshots saved, `npx jest` is green, pitch rehearsed
three times under 3 minutes each.

---

### Person 3 — Eval pass + iteration

**Goal:** the held-out eval set runs cleanly and we fix the top-3 failures.

- [ ] **Run the eval harness** (`python -m backend.evaluation.recall`) on the
  full Phase-2 corpus. Record the baseline `recall@5` in a comment at the top
  of `data/exports/eval_report.json`.
- [ ] **Sort failures by severity**, fix the top 3 only — depth beats
  breadth. Common late-stage fixes:
  - Bad chunking → re-chunk with overlap.
  - Missing factor on a key statute → patch the LLM tagger prompt or hand-edit.
  - Wrong jurisdiction in retrieval → enforce metadata filter.
  - Citation drift (cites doc but not paragraph) → tighten citation regex.
- [ ] **Run it again** after each fix. Land the change only if `recall@5`
  improved or held steady (don't regress for a feel-good fix).
- [ ] **Pin the final number** in `README.md` — judges read README first.

**Blocked by:** Phase 2 eval harness exists.
**Done when:** `recall@5` ≥ 0.8 on the held-out set, README cites the number
with a date stamp.

---

### Person 1 + Person 2 — Slack capacity

After Phase 2 closes, the data + extraction owners are mostly free. Useful
gap-fillers:

- Help Person 5 with screenshot capture (one terminal each runs the demo
  queries while Person 5 captures).
- Help Person 3 patch eval failures that root-cause to data (missing
  statute, mis-tagged factor).
- Hand-test the OpenClaw chat session against weird queries (typos,
  half-citations, queries in the wrong jurisdiction) and file issues — these
  are the queries judges will throw at us.

---

## Critical sequencing

```
Hour 0:  Person 4 lands tools.json + agent_prompt.md (1-2 hrs)
         Person 5 starts demo_script.md (parallel)
         Person 3 runs eval baseline (parallel)
Hour 2:  Person 4's OpenClaw chat session runs end-to-end
         Person 5 starts capturing fallback screenshots
         Person 3 starts top-3 failure fixes
Hour 4:  All artefacts in place; full team rehearses demo once
Hour 5:  Patch the rough edges from rehearsal #1
Hour 6:  Rehearsal #2; should run clean
Hour 7:  Rehearsal #3 with timer; pick the best 3-minute path
Hour 8:  CODE FREEZE. Only bug fixes. Pitch rehearsed solo by the speaker.
```

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| OpenClaw model can't load our tools.json schema | Low | Validate against the OpenClaw schema doc on first commit, not at hour 22. |
| The agent calls `answer_with_sources` directly without retrieving first | Medium | System prompt mandates the workflow; `answer_with_sources` itself runs retrieval, so even a lazy agent stays grounded. |
| Frontend breaks at hour 23 | Medium | Fallback screenshots + `NEXT_PUBLIC_MOCK_MODE=1` (already exists). |
| Demo network outage | Medium | Same as above. Don't rely on Anthropic API at the venue without a backup. |
| Pitch over-runs | Medium | Time the rehearsals. Cut the comparator demo if you have to — verification + retrieval is the highest-scoring tier. |
| Eval regresses on the held-out set | Medium | Person 3 only ships a fix if `recall@5` holds or improves. |

---

## Phase 4 acceptance check

Run before declaring "ship it":

```bash
# 1. Backend healthy
curl -s localhost:8000/status | jq '.indexed_statutes >= 1500 and .last_eval_recall_at_5 >= 0.8'

# 2. All four reasoning surfaces alive
for path in /statutes/search /answer /compare /verify; do
  echo "--- $path ---"
  # See phase3.md acceptance section for full curl bodies
done

# 3. OpenClaw trace
#    Run a single chat session asking the demo's question 1.
#    Expect: search_statutes → answer_with_sources → verify_claims → show_sources

# 4. Frontend smoke
cd frontend && npx tsc --noEmit && npx jest
#    Expect: both clean

# 5. Demo run
#    Open the laptop, run all three demo queries. Time it.
#    Expect: <3 minutes, no console errors, every cite scrolls correctly,
#    every verification badge renders, the pathological query surfaces
#    at least one unsupported claim.

# 6. Fallback screenshots present
ls docs/demo_fallback/*.png | wc -l
#    Expect: ≥ 9 (3 queries × 3 captures each minimum)
```

If all six pass, freeze the branch and rehearse the pitch one more time.
