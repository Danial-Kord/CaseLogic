# Hackathon Implementation Plan

Implementation plan for the EvenUp x OpenClaw 24-hour hackathon. Synthesizes the hackathon brief ([Hackathon Prep.pdf](../Hackathon%20Prep.pdf)) with a modern RAG / evaluation stack (vector search, embeddings, LLM-based extraction, RAG benchmarks, factual grounding).

The single most important constraint: **the eval set is held out until kickoff.** No pre-optimizing on imagined queries, no hardcoded answers.

Source of truth for module shapes and contracts: [openclaw_hackathon_baseline_architecture.md](../openclaw_hackathon_baseline_architecture.md). This plan is the **timeline + technology** layer over that architecture.

---

## Recommended technology guide

Picked for hackathon-fit: minimal setup, source-grounded by default, runs on a laptop, no exotic infra to debug at hour 18.

| Layer | Pick | Why |
|---|---|---|
| Language | Python 3.11+ (backend), TypeScript (frontend) | Already in `requirements.txt`. |
| Web framework | FastAPI + uvicorn | Already in `requirements.txt`. Async, easy docs. |
| DB | SQLite via SQLAlchemy | Zero-config; one file in `data/`. Already specified. |
| Vector DB | **Chroma** (local, persistent) | One `pip install`, no server. LanceDB is a fine alternative. **Avoid** Pinecone/Weaviate/Milvus — network deps and setup time. |
| Embeddings | **`voyage-3` via Voyage AI**, or **`text-embedding-3-small`** (OpenAI), or **BGE-small-en-v1.5** local | Voyage is Anthropic-ecosystem-friendly; BGE is fully offline. Pick based on what's reachable from the hackathon network. |
| LLM | **Claude (Anthropic API)** — provided | Use Claude 4.7 Sonnet for extraction (cheap, fast, structured output via tool use), Claude 4.7 Opus for reasoning/answer if budget allows. |
| Retrieval | **Custom hybrid** = Chroma (vector) + SQLite FTS5 (keyword) + metadata filters | Avoid LangChain/LlamaIndex for the core pipeline — they obscure source tracking, which is the thing judges check. Use them only as reference implementations to crib from. |
| Reranking | LLM-as-reranker over top-50 (Claude) or **`cohere-rerank-v3`** if reachable | Optional in v1. Big quality boost for top-k. |
| Extraction | Claude tool use with Pydantic schemas | Structured output, schema-validated. |
| Evaluation | **Custom mini-RAGAS** harness (faithfulness, context precision, answer correctness) + ad-hoc judge prompt | Don't pull in `ragas` as a dep — too heavy, write 60 lines of eval yourself. |
| Frontend | Vite + React + TypeScript + Tailwind | Fast dev server, judges see results in <30s. |
| Agent layer | OpenClaw with Claude tool-use loop calling FastAPI endpoints | The judges use OpenClaw — make tools, not chat. |

**Explicitly skipped** (don't waste 24 hours on these):
- **Fine-tuning / LoRA / PEFT** — no time, no need; prompt-engineering + few-shot wins.
- **Heavy retrieval frameworks** (LangChain, LlamaIndex) for the core pipeline — debt > benefit at this scope.
- **Distributed compute** — single laptop, single process is plenty for 1k–5k docs.
- **Custom embeddings training** — use off-the-shelf.

---

## Phase 1 — Hours 0–2: Kickoff & lock-in

Goal: read the eval criteria, pick the variant, lock the schema. No coding yet.

- [ ] Read scoring criteria carefully — note point weights per tier
- [ ] Inspect the held-out eval sample (just the **shape**, not memorize)
- [ ] **Pick exactly one variant** from baseline Section 9:
  - A — PI Case Comparator (recommended default — broadest fit)
  - B — Citation Verifier
  - C — Legal Intake Assistant
  - D — Court Trend Analyzer
  - E — Public Records Research Agent
- [ ] **Lock the extraction schema** in [`backend/extraction/schemas.py`](../backend/extraction/schemas.py) — Pydantic models for the chosen variant. Don't add fields you won't use.
- [ ] Confirm jurisdiction + source type. Default: Ontario + CanLII case law.
- [ ] Initialize frontend toolchain: `npm create vite@latest frontend -- --template react-ts` (delete the placeholder `frontend/src/` first), add Tailwind.
- [ ] Sanity-check that `pip install -r requirements.txt` and Anthropic API call both work.

---

## Phase 2 — Hours 2–8: Build the core pipeline (first end-to-end loop)

Goal: a single query produces a source-grounded answer, even if quality is poor. No UI polish yet.

### 2.1 Ingestion
- [ ] [`backend/ingestion/adapters/canlii.py`](../backend/ingestion/adapters/canlii.py): paginate search results, fetch decision HTML, capture canonical citation + URL + court + date + paragraph-numbered body
- [ ] [`backend/ingestion/adapters/web.py`](../backend/ingestion/adapters/web.py): generic URL fetcher fallback
- [ ] [`backend/ingestion/adapters/pdf.py`](../backend/ingestion/adapters/pdf.py): if PDFs appear in eval sources
- [ ] Polite scraping: 1 req/sec, real User-Agent, retry-on-429, on-disk cache to `data/raw/canlii/<citation>.html`
- [ ] [`backend/ingestion/pipeline.py`](../backend/ingestion/pipeline.py): orchestrate fetch → parse → chunk → extract → index
- [ ] Run ingestion over the chosen jurisdiction slice (target: 500–800 decisions)

### 2.2 Parsing
- [ ] [`backend/parsing/html_parse.py`](../backend/parsing/html_parse.py): extract main content from CanLII HTML, capture paragraph numbers
- [ ] [`backend/parsing/clean_text.py`](../backend/parsing/clean_text.py): whitespace normalization, drop boilerplate
- [ ] [`backend/parsing/chunk.py`](../backend/parsing/chunk.py): paragraph-preserving chunker, ~500 tokens, keep `paragraph_start` / `paragraph_end`
- [ ] [`backend/parsing/pdf_parse.py`](../backend/parsing/pdf_parse.py): pypdf wrapper if needed

### 2.3 Storage
- [ ] [`backend/db.py`](../backend/db.py): SQLAlchemy engine + session
- [ ] [`backend/models.py`](../backend/models.py): the 4 tables from baseline (`documents`, `chunks`, `metadata`, `claim_support`)
- [ ] `create_all` on first boot

### 2.4 Embeddings + vector index
- [ ] [`backend/retrieval/embeddings.py`](../backend/retrieval/embeddings.py): provider-agnostic wrapper, batched, cached on disk
- [ ] [`backend/retrieval/vector_store.py`](../backend/retrieval/vector_store.py): Chroma persistent client at `data/index/`, methods `upsert(chunks)` and `search(query, top_k, filters)`

### 2.5 First answer
- [ ] [`backend/main.py`](../backend/main.py): FastAPI app, CORS, mount routers
- [ ] [`backend/api/routes_search.py`](../backend/api/routes_search.py): `/search` → vector retrieval → snippets
- [ ] [`backend/api/routes_answer.py`](../backend/api/routes_answer.py): `/answer` → retrieval + Claude prompt with retrieved context, return answer + cited URLs
- [ ] **Smoke test**: one realistic query end-to-end with source links visible

---

## Phase 3 — Hours 8–14: Extraction + retrieval quality

Goal: retrieval that beats pure vector. Extracted fields that power comparison and filtering.

### 3.1 Structured extraction
- [ ] [`backend/extraction/prompts.py`](../backend/extraction/prompts.py): few-shot prompt with 3–5 worked examples for the locked schema
- [ ] [`backend/extraction/extract.py`](../backend/extraction/extract.py): Claude tool-use call, schema-validated output, `source_support` per field (URL + quote + paragraph)
- [ ] Run extraction over the full corpus in background; persist to `metadata` table

### 3.2 Hybrid retrieval
- [ ] [`backend/retrieval/keyword_search.py`](../backend/retrieval/keyword_search.py): SQLite FTS5 virtual table over chunks
- [ ] [`backend/retrieval/hybrid_search.py`](../backend/retrieval/hybrid_search.py): RRF (reciprocal rank fusion) merge of vector + keyword + metadata filters
- [ ] **Query expansion**: LLM rewrites the user query into 3–5 variants before retrieval (PI synonyms: "soft tissue" ↔ "WAD", "non-pecuniary" ↔ "general damages")

### 3.3 Reranking + contextual retrieval
- [ ] **Reranker**: top-50 from hybrid search → Claude or Cohere reranks → top-10 to LLM
- [ ] **Contextual retrieval** (Anthropic-style): for each chunk, pre-generate a one-sentence document-level context prefix, embed prefix+chunk together — typically a ~35% retrieval-quality lift
- [ ] **Prompt caching**: enable on the system prompt and document context to drop input cost ~10×

### 3.4 Reasoning
- [ ] [`backend/reasoning/answer.py`](../backend/reasoning/answer.py): structured prompt that requires inline `[cite: doc_id, ¶42]` markers
- [ ] [`backend/reasoning/compare.py`](../backend/reasoning/compare.py): N×M field comparison table from extracted metadata
- [ ] [`backend/reasoning/summarize.py`](../backend/reasoning/summarize.py): if the chosen variant calls for it

---

## Phase 4 — Hours 14–18: Verification (the differentiator)

Goal: every important claim has a green/amber/red badge. Judges spot-check this — single highest-leverage area.

- [ ] [`backend/verification/claims.py`](../backend/verification/claims.py): split answer into atomic claims (Claude prompt or regex over inline citations)
- [ ] [`backend/verification/verify.py`](../backend/verification/verify.py): for each claim, retrieve cited snippet, ask Claude "does this snippet support this claim? verified / partial / unsupported / contradicted" and store the reason
- [ ] [`backend/verification/citations.py`](../backend/verification/citations.py): canonicalize CanLII URLs + paragraph anchors
- [ ] [`backend/api/routes_verify.py`](../backend/api/routes_verify.py): `/verify` endpoint
- [ ] Frontend `VerificationPanel`: render badges (green/amber/red/gray) with hover-snippet
- [ ] **Critical agent rule**: if a claim is unsupported, mark it unsupported. Do not silently drop. The judges WILL test this with a pathological query.

OpenClaw agent wiring (do in parallel with the above):

- [ ] [`openclaw/agent_prompt.md`](../openclaw/agent_prompt.md): paste the system prompt from baseline Section 10, customize for the chosen variant
- [ ] [`openclaw/tools.json`](../openclaw/tools.json): declare `search_documents`, `get_document`, `extract_fields`, `compare_documents`, `verify_claims`, `show_sources`
- [ ] Tool implementations as thin wrappers over the FastAPI routes

---

## Phase 5 — Hours 18–22: Evaluate, iterate, polish

Goal: hit the held-out eval set, fix the biggest weaknesses, polish UX.

### 5.1 Eval harness
- [ ] `backend/evaluation/`: tiny harness that runs `(query, expected_keywords, expected_sources)` triples and computes:
  - **Retrieval recall@k** — did at least one relevant doc surface?
  - **Faithfulness** — does every claim trace to a retrieved snippet? (LLM-as-judge)
  - **Citation precision** — do all cited URLs exist in the retrieved set?
- [ ] CLI: `python -m backend.evaluation.run --suite holdout`
- [ ] Run held-out eval set end-to-end; log per-query pass/fail

### 5.2 Iterate on top failures
Sort failures by severity, fix top 3 only — depth beats breadth. Common late-stage fixes:
- Bad chunking → re-chunk with overlap
- Missing entities in extraction → expand schema (carefully)
- Wrong jurisdiction in retrieval → enforce metadata filter
- Citation drift (cites doc but not paragraph) → tighten citation regex

### 5.3 Frontend polish
- [ ] Wire components: `SearchPanel`, `ResultsPanel`, `ComparisonTable`, `VerificationPanel`, `SourceViewer`, `DatasetStatus`
- [ ] 3-column layout from baseline Section 7
- [ ] Dataset status panel showing indexed doc count + verification mode indicator
- [ ] Error states for "no results" and "unsupported claim"

### 5.4 Demo prep
- [ ] [`docs/demo_script.md`](demo_script.md): 3 queries that exercise different tiers
- [ ] Fallback screenshots for every demo query (in case the network dies)

---

## Phase 6 — Hours 22–24: Freeze + rehearse

Goal: don't break anything; pitch is tight.

- [ ] **Code freeze** at hour 22 — only bug fixes, no new features
- [ ] Demo rehearsal x3: time it, pick the best 3-minute path
- [ ] Pitch beats: problem + what's locked behind paywalls + 30-second value framing + live query
- [ ] Print disclaimer in UI footer (research prototype, not legal advice)

---

## Stretch — bonus tier stacking

Only attempt these if Phase 5 finishes early. They map to "ambition is rewarded" in the brief.

- **Cross-document reasoning**: "find me 5 cases similar to this fact pattern, ranked by award size" — comparator + ranking on extracted fields
- **Damages calibrator**: extract every damages award in the corpus, build a non-pecuniary distribution by injury type — this is a public substitute for paywalled quantum digests (the brief's "going after what's locked behind paywalls" hint)
- **Multi-hop agent**: OpenClaw makes 3+ tool calls per question, plans, and synthesizes — covers the "agentic workflow chops" hint
- **Adversarial robustness**: a "no answer found" path that gracefully says "no public source supports this" instead of confabulating
- **Live ingestion**: judge gives a URL, system ingests it on the fly, answers from it 30 seconds later

---

## Recommended pre-kickoff reading

Short list, all free:

- **Anthropic — Building effective agents** ([anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents)) — agentic patterns, tool use vs workflow trade-offs.
- **Anthropic — Contextual Retrieval** ([anthropic.com/news/contextual-retrieval](https://www.anthropic.com/news/contextual-retrieval)) — chunk-prefix trick that improves retrieval ~35% with no extra infra.
- **Anthropic — Prompt caching** docs — drop input cost ~10× when re-running over a static corpus.
- **RAGAS paper** (Es et al. 2023) — faithfulness, answer relevancy, context precision/recall metrics.
- **BGE / E5 embedding model cards** — pick one if going local-only.
- Skim **CanLII terms of service** ([canlii.org/en/info/terms.html](https://www.canlii.org/en/info/terms.html)) — know the line before scraping.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Eval set is in a jurisdiction we didn't anticipate | Medium | Web adapter handles arbitrary URLs; CanLII covers all provinces — re-run adapter with new filter |
| CanLII rate-limits us mid-hackathon | Medium | Polite scraping + on-disk cache; rotate UA; build tolerance to 429s |
| Anthropic API hiccup | Low | Cache extraction outputs to disk; degrade reasoning to a smaller model if needed |
| Frontend breaks at hour 22 | Medium | Fallback screenshots + a "demo mode" that loads pre-recorded responses |
| Scope creep into a second variant | High | "We're doing one variant" is a hard line — bonus tiers stack on the chosen variant, not a new one |
| Verification layer flags everything as `unsupported` | Medium | Calibrate the judge prompt with 5 known-good and 5 known-bad examples before running on the eval set |

---

## Definition of done

By Phase 4, the system should support this on a real CanLII corpus:

```
> /search non-pecuniary damages chronic pain rear-end collision
[returns 10 cases with snippets]

> /compare doc_001 doc_017
[returns side-by-side table of injuries / damages / liability]

> /answer What is the typical non-pecuniary damages award for chronic pain in Ontario rear-end collisions?
[returns answer with inline citations + verification badges]

> /verify
[shows green/amber/red badge per claim with hover snippet]
```

If this works, Phase 5–6 is just hardening and demo polish.
