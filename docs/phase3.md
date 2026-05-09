# Phase 3 — Source-grounded reasoning + verification

> **Roadmap**
>
> | Phase | Theme | Status | Doc |
> |---|---|---|---|
> | 1 | Statute search loop (CA VEH, query → result → UI) | **Shipped on `main`** | [phase1_plan.md](phase1_plan.md) |
> | 2 | Complete corpus + measurable retrieval | In progress | [phase2.md](phase2.md) |
> | 3 | Source-grounded reasoning + verification | **This doc** | [phase3.md](phase3.md) |
> | 4 | OpenClaw wiring + demo polish + freeze | Pending | [phase4.md](phase4.md) |
>
> Source of truth for module shapes: [../openclaw_hackathon_baseline_architecture.md](../openclaw_hackathon_baseline_architecture.md).

---

## Phase 3 deliverable (definition of done)

```
> POST /answer  { "query": "rear-end collision at red light, defendant texting; CA" }
{
  "answer": "Under California law, a rear-end driver who fails to stop ...",
  "claims": [
    {"text":"A driver must stop at a steady red signal.", "cites":["ca-veh-21453-a:¶1"]},
    {"text":"Texting while driving is prohibited under §23123.5.", "cites":["ca-veh-23123-5:¶1"]}
  ],
  "retrieved": [ ... ]
}

> POST /verify  { "answer":"...", "cites":[...] }
[
  {"claim":"...", "status":"verified",   "reason":"..."},
  {"claim":"...", "status":"unsupported","reason":"no cite provided"}
]

> POST /compare { "fact_pattern":"...", "statute_ids":["ca-veh-21453-a","ca-veh-21801"] }
[
  {"statute_id":"ca-veh-21453-a","element_required":"...","would_apply":"yes",...},
  {"statute_id":"ca-veh-21801",  "element_required":"...","would_apply":"maybe",...}
]
```

A judge can: type a fact pattern, get an answer, click a `[cite: ¶3]` badge,
land on the exact paragraph in the source viewer, and see green / amber / red
verification badges. The pathological-query test ("defendant exceeded 200 mph
in a school zone") leaves at least one claim flagged `unsupported` instead
of silently dropping it.

---

## What's already in place vs. what's net-new

**In place from Phase 1**

- Hybrid retrieval (`backend.retrieval.hybrid_search.retrieve`) is callable
  from any backend module — the reasoning layer just consumes it.
- `parse_citation` in [`backend/retrieval/__init__.py`](../backend/retrieval/__init__.py)
  already canonicalizes `21453(a)` ↔ `ca-veh-21453-a`. Reuse it; don't
  rewrite citation parsing in `verification/citations.py`.
- Frontend `SourceViewer` renders the full statute today and accepts a
  `statuteId` prop. Phase 3 just adds paragraph anchors + scroll behaviour.

**Stubs to fill**

| File | Today | Phase 3 task |
|---|---|---|
| [`backend/api/routes_answer.py`](../backend/api/routes_answer.py) | 53-byte stub | Real `POST /answer` route |
| [`backend/api/routes_verify.py`](../backend/api/routes_verify.py) | 67-byte stub | Real `POST /verify` route |
| [`backend/reasoning/answer.py`](../backend/reasoning/answer.py) | 65-byte stub | Claude reasoning with cite-on-every-claim contract |
| [`backend/reasoning/compare.py`](../backend/reasoning/compare.py) | 75-byte stub | N-statute element-wise table builder |
| [`backend/reasoning/summarize.py`](../backend/reasoning/summarize.py) | 66-byte stub | Optional helper for `/answer` short-summary mode |
| [`backend/verification/claims.py`](../backend/verification/claims.py) | 60-byte stub | Atomic-claim splitter (regex over `[cite: ...]`) |
| [`backend/verification/verify.py`](../backend/verification/verify.py) | 78-byte stub | Per-claim Claude verifier |
| [`backend/verification/citations.py`](../backend/verification/citations.py) | 60-byte stub | Citation canonicalizer (delegates to `parse_citation`) |
| [`backend/models.py`](../backend/models.py) | no `claim_support` table | Add `claim_support` model (claim, statute_id, status, reason, run_id) |
| [`frontend/components/ComparisonTable.tsx`](../frontend/components/ComparisonTable.tsx) | `return null` | Real component wired to `/compare` |
| [`frontend/components/VerificationPanel.tsx`](../frontend/components/VerificationPanel.tsx) | `return null` | Real component wired to `/verify` |
| [`frontend/components/ChatPanel.tsx`](../frontend/components/ChatPanel.tsx) | implemented (8 KB) but not mounted | Mount in [`app/page.tsx`](../frontend/app/page.tsx); swap `api.chat` to call `/answer` |
| [`frontend/components/SourceViewer.tsx`](../frontend/components/SourceViewer.tsx) | full text rendering | Add `id="p<n>"` paragraph anchors + scroll-to-cite |

---

## Workload split

### Person 4 — Agent / Backend Lead

**Goal:** turn retrieval into source-grounded answers, comparisons, and
verification — exposed as well-typed REST endpoints.

- [ ] **`POST /answer`** ([`backend/api/routes_answer.py`](../backend/api/routes_answer.py),
  [`backend/reasoning/answer.py`](../backend/reasoning/answer.py)):
  - Run hybrid retrieval (top 8). Build a Claude prompt with the retrieved
    snippets + factor tags + paragraph anchors.
  - **Hard rule** in the system prompt: every factual claim must end with
    `[cite: <statute_id>, ¶<para>]`. No bare claims allowed.
  - Return `{ answer: str, claims: [{text, cites: [...]}], retrieved: [...] }`.
  - Add a request schema in [`backend/api/schemas.py`](../backend/api/schemas.py)
    (`AnswerRequest`, `AnswerResponse`, `Claim`).
- [ ] **`POST /compare`** ([`backend/reasoning/compare.py`](../backend/reasoning/compare.py)):
  - Input: a fact pattern + 2–N statute IDs. Output: a row-per-statute table of
    `{element_required, supporting_text, factors, would_apply: yes/no/maybe}`.
  - This powers Person 5's `ComparisonTable`. Mount via a new
    `routes_compare.py` if you'd rather keep `routes_answer.py` focused.
- [ ] **`POST /verify`** ([`backend/api/routes_verify.py`](../backend/api/routes_verify.py),
  [`backend/verification/{claims,verify,citations}.py`](../backend/verification/)):
  - `claims.py`: split an answer into atomic claims. Regex over `[cite: ...]`
    is fine; LLM split is overkill.
  - `verify.py`: for each claim, fetch the cited statute, ask Claude
    `verified | partial | unsupported | contradicted` + reason. Persist into
    a new `claim_support` table — add it to
    [`backend/models.py`](../backend/models.py).
  - `citations.py`: canonicalize citation strings. Delegate to
    `backend.retrieval.parse_citation` instead of reinventing the regex.
- [ ] **Wire the new routers** in [`backend/main.py`](../backend/main.py)
  (`app.include_router(routes_answer.router)` etc.) and bump the smoke test
  in [`backend/tests/test_retrieval_api.py`](../backend/tests/test_retrieval_api.py)
  with at least one happy-path case per endpoint.
- [ ] **Critical agent rule (paste verbatim into the prompt)**: *If a claim has
  no supporting source, mark it unsupported. Do not silently drop it. The judges
  will test this with a pathological query.*

**Files:** [backend/api/routes_answer.py](../backend/api/routes_answer.py),
[backend/api/routes_verify.py](../backend/api/routes_verify.py),
[backend/reasoning/](../backend/reasoning/),
[backend/verification/](../backend/verification/),
[backend/models.py](../backend/models.py),
[backend/main.py](../backend/main.py),
[backend/api/schemas.py](../backend/api/schemas.py).

**Blocks:** Person 5 swaps fakes for real responses; Phase 4 OpenClaw tools
wrap these endpoints.
**Blocked by:** Phase 2 retrieval quality is *useful but not required* —
Person 4 can stub against the current 25-row corpus while Phase 2 finishes.
**Done when:** all three endpoints return well-typed JSON for both happy and
pathological inputs, with claims + cites + statuses populated as expected.

---

### Person 5 — Product / Demo Lead

**Goal:** the three new components are real, the chat surface is mounted,
and clicking a citation scrolls the source viewer to the right paragraph.

- [ ] **`ComparisonTable.tsx`** — wire to `POST /compare`. One column per
  statute, one row per element. Background-tint cells by `would_apply`
  (`brand.verified` / `brand.warning` / `brand.error` / `brand.muted` from
  [tailwind.config.ts](../frontend/tailwind.config.ts)). Today it's a 5-line
  `return null` stub.
- [ ] **`VerificationPanel.tsx`** — render `/verify` output as a list of
  claims with badges. Same brand palette. Clicking a claim emits a
  `cite-clicked` callback that the page passes to `SourceViewer`. Today it's
  a 9-line `return null` stub.
- [ ] **Mount `ChatPanel.tsx`** in [`frontend/app/page.tsx`](../frontend/app/page.tsx):
  the component itself is built (real markdown rendering, source attribution
  UI, mock-mode handling). Page just needs to render it, conditionally
  toggle between search-grid mode and chat mode (single tab toggle in the
  header), and call `api.chat()` (which today wraps `/statutes/search` —
  swap it to call `/answer` once that endpoint lands).
- [ ] **`SourceViewer` paragraph anchors**: when a `[cite: ¶3]` is clicked,
  scroll to paragraph 3. Means splitting `statute_text` on paragraph breaks
  and adding `id="p<n>"` anchors per paragraph; the parent page calls
  `document.getElementById('p3')?.scrollIntoView({behavior:'smooth'})`.
- [ ] **Loading / empty / error states** for the new endpoints, matching the
  conventions used by `ResultsPanel` / `SourceViewer` today.
- [ ] **Update the `lib/api.ts` mock branch** so demo mode keeps working when
  `NEXT_PUBLIC_MOCK_MODE=1` — add canned `/answer`, `/compare`, `/verify`
  responses keyed off the same demo queries Phase 4 will use.
- [ ] **Frontend types**: extend [`frontend/lib/types.ts`](../frontend/lib/types.ts)
  with `AnswerRequest`, `AnswerResponse`, `Claim`, `CompareRequest`,
  `CompareRow`, `VerifyRequest`, `VerifyResult`. Mirror the Pydantic shapes
  Person 4 lands.

**Files:** [frontend/components/ComparisonTable.tsx](../frontend/components/ComparisonTable.tsx),
[frontend/components/VerificationPanel.tsx](../frontend/components/VerificationPanel.tsx),
[frontend/components/SourceViewer.tsx](../frontend/components/SourceViewer.tsx),
[frontend/app/page.tsx](../frontend/app/page.tsx),
[frontend/lib/api.ts](../frontend/lib/api.ts),
[frontend/lib/types.ts](../frontend/lib/types.ts).

**Blocks:** Phase 4 demo script uses the new UI surface.
**Blocked by:** Person 4 endpoints (but `MOCK_MODE` lets you build in
parallel — start there).
**Done when:** rendering all three new components against the real backend
produces no console errors and round-trips data cleanly; clicking a cite
scrolls the source viewer to the right paragraph.

---

## Critical sequencing

```
Hour 0:  Person 4 stubs out /answer, /compare, /verify (return canned shape)
         Person 5 mounts ChatPanel + scaffolds ComparisonTable + VerificationPanel
                  against MOCK_MODE responses
Hour 1:  Person 5 unblocks (real types from Person 4) → wires real fetch calls
Hour 2:  Person 4 starts filling /answer with real Claude calls
Hour 3:  Person 4 starts /verify (claim split + per-claim verifier)
Hour 4:  Person 4 starts /compare
Hour 5:  Person 5 finishes paragraph anchors + scroll-to-cite plumbing
Hour 6:  End-to-end: ChatPanel → /answer → cite click → scroll in SourceViewer
         → VerificationPanel badges all show
         Phase 3 done → Phase 4 starts
```

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Verifier flags everything as `unsupported` | Medium | Calibrate with 5 known-good + 5 known-bad pairs before running broadly. |
| `/answer` returns claims without cites | Medium | Hard validator after the LLM call: regex out claims missing `[cite: ...]`, re-prompt once with a "you forgot citations" message before giving up and tagging the claim unsupported. |
| Claim splitter over-splits / under-splits | Low | Use the citation-as-delimiter heuristic; if a paragraph has no cite, treat the whole paragraph as one claim and let `/verify` mark it `unsupported`. |
| `claim_support` schema drifts late | Low | Land the migration in Phase 3 hour 0, before any real verifier code; all later writers conform. |
| Frontend renders before types stabilise | Medium | Person 4 publishes the Pydantic schemas first (hour 0 deliverable); Person 5's types track them. |

---

## Phase 3 acceptance check

```bash
# Reasoning returns claims with cites
curl -s -X POST localhost:8000/answer \
  -H "Content-Type: application/json" \
  -d '{"query":"rear-end collision at red light, defendant texting; CA"}' \
  | jq '.claims[] | select(.cites | length == 0)'
#  Expect: empty (every claim has at least one cite, OR is a hedging sentence)

# Pathological query: unsupported claims must be visible, not hidden
curl -s -X POST localhost:8000/answer \
  -H "Content-Type: application/json" \
  -d '{"query":"the defendant exceeded 200 mph in a school zone in CA"}' \
  | jq '.claims[] | {text, cites}'
#  Expect: at least one claim with cites == []

# Verifier returns a status per claim
curl -s -X POST localhost:8000/verify \
  -H "Content-Type: application/json" \
  -d '{"answer":"Drivers must stop at red lights [cite: ca-veh-21453-a, ¶1].", "cites":["ca-veh-21453-a"]}' \
  | jq '.[] | {claim, status}'
#  Expect: status ∈ {verified, partial, unsupported, contradicted}

# Comparison returns a row per statute
curl -s -X POST localhost:8000/compare \
  -H "Content-Type: application/json" \
  -d '{"fact_pattern":"defendant ran a red light","statute_ids":["ca-veh-21453-a","ca-veh-21801"]}' \
  | jq 'length'
#  Expect: 2
```

If all four return sensible output and the UI round-trips cleanly,
Phase 3 ships and Phase 4 takes over.
