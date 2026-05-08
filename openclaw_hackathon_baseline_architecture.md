# OpenClaw Hackathon Baseline Architecture

**Purpose:** This document defines the reusable base architecture your team can use for almost any EvenUp x OpenClaw hackathon idea.

Use this as the technical foundation whether you build:

- A PI case-law research agent
- A damages comparator
- A public legal data search engine
- A legal intake assistant
- A document analysis tool
- A citation verifier
- A research workflow agent
- A legal data extraction pipeline

The specific idea can change, but the baseline system should stay mostly the same.

---

## 1. Core Principle

The hackathon brief rewards systems that turn messy public legal data into something useful, searchable, organized, and verifiable.

So the baseline architecture should always support this loop:

```text
Public data source
  → ingestion
  → cleaning / parsing
  → structured extraction
  → storage
  → semantic + keyword search
  → agent workflow
  → source-grounded answer
  → verification
  → demo UI
```

Every project idea should be evaluated by asking:

> Can it ingest real public data, organize it, retrieve relevant evidence, and answer with verifiable sources?

If yes, it fits the baseline.

---

## 2. High-Level Architecture

```text
                          ┌────────────────────────┐
                          │   Public Data Sources   │
                          │ court records, cases,   │
                          │ gov datasets, web pages │
                          └───────────┬────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │   Ingestion Layer       │
                          │ scrape, fetch, upload,  │
                          │ parse, deduplicate      │
                          └───────────┬────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │ Cleaning + Chunking     │
                          │ normalize text, split,  │
                          │ preserve source refs    │
                          └───────────┬────────────┘
                                      │
                                      ▼
             ┌────────────────────────┴────────────────────────┐
             │                                                 │
             ▼                                                 ▼
 ┌────────────────────────┐                       ┌────────────────────────┐
 │ Structured Extraction   │                       │ Embedding Generation    │
 │ injuries, damages,      │                       │ semantic vectors for    │
 │ dates, parties, issues  │                       │ chunks and summaries    │
 └───────────┬────────────┘                       └───────────┬────────────┘
             │                                                │
             ▼                                                ▼
 ┌────────────────────────┐                       ┌────────────────────────┐
 │ Relational / JSON Store │                       │ Vector Index            │
 │ metadata, sources,      │                       │ semantic retrieval      │
 │ extracted fields        │                       │ over legal text         │
 └───────────┬────────────┘                       └───────────┬────────────┘
             │                                                │
             └──────────────────────┬─────────────────────────┘
                                    ▼
                          ┌────────────────────────┐
                          │ Retrieval API           │
                          │ hybrid search, filters, │
                          │ snippets, ranking       │
                          └───────────┬────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │ OpenClaw Agent Layer    │
                          │ tool use, planning,     │
                          │ compare, summarize      │
                          └───────────┬────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │ Verification Layer      │
                          │ claim → source snippet  │
                          │ supported / unsupported │
                          └───────────┬────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │ Demo Interface          │
                          │ chat, dashboard, table, │
                          │ source viewer           │
                          └────────────────────────┘
```

---

## 3. The Baseline Modules

Every idea should reuse these modules.

### Module 1 — Data Source Adapter

**Goal:** Connect to one or more public data sources.

Examples:

- Court decision websites
- Public legal databases
- Government datasets
- Public PDFs
- Court forms
- Public regulatory guidance
- Open web pages
- Uploaded documents

Responsibilities:

- Fetch pages or files
- Track source URLs
- Save raw data
- Avoid duplicate documents
- Handle basic failures

Suggested interface:

```python
def fetch_sources(query: str | None = None) -> list[dict]:
    """
    Returns raw public documents with source metadata.
    """
```

Example output:

```json
[
  {
    "source_id": "src_001",
    "title": "Example v. Example",
    "url": "https://public-source.example/case/123",
    "source_type": "case_law",
    "retrieved_at": "2026-05-07T10:00:00Z",
    "raw_html": "...",
    "raw_text": "..."
  }
]
```

---

### Module 2 — Parser / Cleaner

**Goal:** Convert raw source material into usable text.

Responsibilities:

- Remove navigation, ads, boilerplate, and duplicate text
- Extract readable main content
- Preserve paragraph numbers when possible
- Normalize whitespace
- Identify document title, date, court, jurisdiction, and URL
- Convert PDFs or HTML into plain text

Suggested interface:

```python
def parse_document(raw_doc: dict) -> dict:
    """
    Cleans and normalizes a raw public document.
    """
```

Example output:

```json
{
  "document_id": "doc_001",
  "title": "Example v. Example",
  "url": "https://public-source.example/case/123",
  "jurisdiction": "Ontario",
  "date": "2021-05-12",
  "text": "Full cleaned text...",
  "paragraphs": [
    {"number": "1", "text": "..."},
    {"number": "2", "text": "..."}
  ]
}
```

---

### Module 3 — Chunker

**Goal:** Split long documents into searchable chunks while preserving source references.

Responsibilities:

- Split by paragraphs or token length
- Keep document ID, source URL, and paragraph range
- Avoid chunks that are too small or too large
- Store enough context for citation snippets

Suggested interface:

```python
def chunk_document(parsed_doc: dict) -> list[dict]:
    """
    Splits a cleaned document into retrievable chunks.
    """
```

Example output:

```json
[
  {
    "chunk_id": "chunk_001",
    "document_id": "doc_001",
    "url": "https://public-source.example/case/123",
    "paragraph_start": "40",
    "paragraph_end": "45",
    "text": "..."
  }
]
```

---

### Module 4 — Structured Extraction

**Goal:** Turn messy text into structured fields useful for the chosen idea.

For PI research, extract:

- Accident type
- Injury type
- Damages
- Court
- Date
- Jurisdiction
- Legal issues
- Key facts
- Source quotes

For other ideas, extract different fields.

Examples:

| Idea | Fields to Extract |
|---|---|
| PI case comparator | injury, accident, damages, liability, key facts |
| Legal intake assistant | claim type, deadline, parties, missing documents |
| Court trend analyzer | court, judge, issue, result, award amount |
| Citation verifier | claims, source snippets, paragraph references |
| Government dataset assistant | agency, topic, date, numeric fields, source URL |

Suggested interface:

```python
def extract_metadata(document: dict, schema_name: str) -> dict:
    """
    Uses an LLM or rules to extract structured metadata.
    """
```

Example output:

```json
{
  "document_id": "doc_001",
  "schema": "personal_injury_case",
  "fields": {
    "accident_type": "rear-end motor vehicle collision",
    "injuries": ["chronic neck pain", "back pain"],
    "damages": {
      "non_pecuniary": "$85,000",
      "future_care": "$12,000",
      "total": "unknown"
    },
    "jurisdiction": "Ontario",
    "legal_issues": ["damages", "liability"]
  },
  "confidence": 0.84,
  "source_support": [
    {
      "field": "injuries",
      "quote": "...",
      "url": "https://public-source.example/case/123",
      "paragraph": "42"
    }
  ]
}
```

---

### Module 5 — Storage Layer

**Goal:** Store raw documents, cleaned text, extracted metadata, chunks, and vectors.

Minimum hackathon storage:

```text
/data/raw/          Raw HTML, PDFs, or source text
/data/processed/    Cleaned text and metadata JSON
/data/index/        Vector index files
/app.db             SQLite database
```

Recommended database tables:

#### `documents`

| Field | Purpose |
|---|---|
| document_id | Internal ID |
| title | Document title |
| url | Public source URL |
| source_type | Case, dataset, PDF, web page |
| jurisdiction | Region if known |
| date | Source date if known |
| raw_path | Local raw file path |
| text_path | Cleaned text path |

#### `chunks`

| Field | Purpose |
|---|---|
| chunk_id | Internal ID |
| document_id | Parent document |
| text | Chunk text |
| paragraph_start | Source paragraph start |
| paragraph_end | Source paragraph end |
| embedding_id | Vector index reference |

#### `metadata`

| Field | Purpose |
|---|---|
| document_id | Parent document |
| schema_name | Extraction schema |
| fields_json | Structured extracted fields |
| confidence | Extraction confidence |

#### `claim_support`

| Field | Purpose |
|---|---|
| claim_id | Internal ID |
| document_id | Source document |
| claim | Generated claim |
| snippet | Supporting text |
| status | verified / partial / unsupported |

---

### Module 6 — Embeddings and Vector Index

**Goal:** Make messy public legal text searchable by meaning.

Responsibilities:

- Embed chunks
- Embed extracted summaries
- Store vectors
- Search by natural language
- Return snippets and metadata

Suggested interface:

```python
def build_vector_index(chunks: list[dict]) -> None:
    """
    Creates or updates the semantic index.
    """


def semantic_search(query: str, top_k: int = 10, filters: dict | None = None) -> list[dict]:
    """
    Returns semantically relevant chunks/documents.
    """
```

Recommended hackathon options:

- Chroma
- LanceDB
- Qdrant
- FAISS
- Postgres + pgvector

Best default:

> Chroma or LanceDB for speed; Postgres + pgvector only if someone already knows it well.

---

### Module 7 — Hybrid Retrieval

**Goal:** Improve results by combining semantic search with exact matching and metadata filters.

Why this matters:

Legal research often depends on exact phrases, statutes, courts, amounts, and dates. Pure vector search can miss those.

Retrieval should combine:

- Semantic similarity
- Keyword match
- Metadata filters
- Recency or jurisdiction filters
- Source type filters

Suggested interface:

```python
def retrieve(query: str, filters: dict | None = None, top_k: int = 10) -> list[dict]:
    """
    Hybrid search over vectors, text, and metadata.
    """
```

Example filters:

```json
{
  "jurisdiction": "Ontario",
  "source_type": "case_law",
  "injury_type": "chronic pain",
  "date_after": "2015-01-01"
}
```

Example output:

```json
[
  {
    "document_id": "doc_001",
    "title": "Example v. Example",
    "url": "https://public-source.example/case/123",
    "score": 0.91,
    "matched_fields": ["injuries", "accident_type"],
    "snippet": "...",
    "metadata": {}
  }
]
```

---

### Module 8 — Reasoning / Summarization Layer

**Goal:** Turn retrieved results into a useful answer.

This layer should not use model memory for facts. It should only summarize retrieved evidence.

Responsibilities:

- Synthesize search results
- Compare documents
- Extract patterns
- Generate user-facing summaries
- Include caveats
- Avoid unsupported claims

Suggested interface:

```python
def generate_answer(user_query: str, retrieved_items: list[dict]) -> dict:
    """
    Produces a source-grounded answer from retrieved evidence.
    """
```

Expected output:

```json
{
  "answer": "Based on the retrieved public sources...",
  "claims": [
    {
      "claim": "Case A involved chronic neck pain.",
      "source_url": "https://...",
      "snippet": "..."
    }
  ],
  "limitations": [
    "Only indexed public sources were searched.",
    "This is not legal advice."
  ]
}
```

---

### Module 9 — Verification Layer

**Goal:** Make sure important claims trace back to public sources.

This is one of the most important parts of the hackathon baseline.

Responsibilities:

- Identify factual claims in the answer
- Match each claim to source snippets
- Mark claims as verified, partial, or unsupported
- Prevent unsupported claims from being shown as facts
- Show source URLs and paragraph references

Suggested interface:

```python
def verify_claims(answer: str, sources: list[dict]) -> list[dict]:
    """
    Checks whether claims are supported by retrieved source snippets.
    """
```

Example output:

```json
[
  {
    "claim": "The plaintiff suffered chronic neck pain.",
    "status": "verified",
    "source_url": "https://public-source.example/case/123",
    "paragraph": "42",
    "snippet": "..."
  },
  {
    "claim": "The plaintiff was 42 years old.",
    "status": "unsupported",
    "reason": "No supporting source found."
  }
]
```

Agent rule:

```text
If a claim is unsupported, either remove it or explicitly mark it as unverified.
```

---

### Module 10 — OpenClaw Agent Layer

**Goal:** Expose the research workflow through an agentic chat interface.

OpenClaw should call your tools rather than directly invent answers.

Baseline OpenClaw tools:

```text
search_documents
get_document
extract_fields
compare_documents
verify_claims
show_sources
```

Optional tools:

```text
ingest_url
ingest_query
export_report
create_timeline
rank_similar_cases
```

Agent flow:

```text
User asks question
  ↓
Agent identifies task type
  ↓
Agent calls retrieval tool
  ↓
Agent gets source snippets
  ↓
Agent summarizes retrieved evidence
  ↓
Agent calls verification tool
  ↓
Agent returns answer with citations / source links
```

Baseline system prompt:

```text
You are a source-grounded legal research assistant built for the EvenUp x OpenClaw Hackathon.
You help users search, compare, and understand public legal information.
You must only answer factual questions using retrieved public sources.
You must cite or link the source for every important factual claim.
If the source does not support a claim, say that it could not be verified.
You are not a lawyer and do not provide legal advice.
Use tools before answering whenever the user asks about legal facts, cases, documents, damages, deadlines, or public records.
```

---

### Module 11 — API Layer

**Goal:** Provide stable endpoints for the UI and OpenClaw tools.

Recommended framework:

- FastAPI

Baseline endpoints:

```text
POST /ingest/url
POST /ingest/search
POST /search
GET  /documents/{document_id}
POST /compare
POST /answer
POST /verify
GET  /status
```

Example `/search` request:

```json
{
  "query": "chronic pain rear-end collision Ontario",
  "filters": {
    "jurisdiction": "Ontario",
    "source_type": "case_law"
  },
  "top_k": 10
}
```

Example `/search` response:

```json
{
  "results": [
    {
      "document_id": "doc_001",
      "title": "Example v. Example",
      "url": "https://...",
      "score": 0.91,
      "snippet": "...",
      "metadata": {}
    }
  ]
}
```

---

### Module 12 — Demo UI Layer

**Goal:** Make the system easy to understand in a live judge demo.

Every idea should have a simple interface with:

1. Query box
2. Filters
3. Results list
4. Comparison / answer area
5. Source verification panel
6. Dataset status

Even if OpenClaw chat works, a visual UI helps judges understand what is happening.

Recommended layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ App name              Indexed docs: 243    Verified mode: ON │
├──────────────────────┬──────────────────────┬────────────────┤
│ Search / Filters      │ Results / Answer      │ Source Verify  │
│                       │                      │                │
│ Query box             │ Case cards / table    │ Claims         │
│ Jurisdiction          │ Generated summary     │ Snippets       │
│ Source type           │ Compare button        │ Source links   │
│ Search button         │                      │                │
└──────────────────────┴──────────────────────┴────────────────┘
```

---

## 4. Baseline Data Flow

### Step 1 — Ingest

```text
Source URL or search query → raw document saved locally
```

### Step 2 — Parse

```text
Raw HTML/PDF → cleaned text + paragraphs
```

### Step 3 — Chunk

```text
Clean text → source-preserving chunks
```

### Step 4 — Extract

```text
Clean text → structured metadata JSON
```

### Step 5 — Index

```text
Chunks + metadata → embeddings + vector index
```

### Step 6 — Retrieve

```text
User query → hybrid search → top documents + snippets
```

### Step 7 — Generate

```text
Retrieved snippets → answer / comparison / summary
```

### Step 8 — Verify

```text
Answer claims → source support check → verified answer
```

### Step 9 — Display

```text
Verified answer → OpenClaw chat + dashboard UI
```

---

## 5. Baseline Repository Structure

```text
project-name/
  README.md
  .env.example
  requirements.txt
  package.json

  data/
    raw/
    processed/
    exports/
    index/

  backend/
    main.py
    config.py
    db.py
    models.py

    ingestion/
      adapters/
        base.py
        canlii.py
        web.py
        pdf.py
      pipeline.py

    parsing/
      clean_text.py
      chunk.py
      pdf_parse.py
      html_parse.py

    extraction/
      schemas.py
      extract.py
      prompts.py

    retrieval/
      embeddings.py
      vector_store.py
      keyword_search.py
      hybrid_search.py

    reasoning/
      answer.py
      compare.py
      summarize.py

    verification/
      claims.py
      verify.py
      citations.py

    api/
      routes_ingest.py
      routes_search.py
      routes_answer.py
      routes_verify.py
      routes_status.py

  openclaw/
    agent_prompt.md
    tools.json
    config.example.json

  frontend/
    src/
      App.tsx
      components/
        SearchPanel.tsx
        ResultsPanel.tsx
        ComparisonTable.tsx
        VerificationPanel.tsx
        SourceViewer.tsx
        DatasetStatus.tsx

  docs/
    architecture.md
    demo_script.md
    design_notes.md
```

---

## 6. Baseline API Contracts

### `search_documents`

```json
{
  "query": "string",
  "filters": {},
  "top_k": 10
}
```

Returns:

```json
{
  "results": [
    {
      "document_id": "string",
      "title": "string",
      "url": "string",
      "score": 0.91,
      "snippet": "string",
      "metadata": {}
    }
  ]
}
```

---

### `get_document`

```json
{
  "document_id": "string"
}
```

Returns:

```json
{
  "document_id": "string",
  "title": "string",
  "url": "string",
  "text": "string",
  "metadata": {},
  "chunks": []
}
```

---

### `extract_fields`

```json
{
  "document_id": "string",
  "schema_name": "string"
}
```

Returns:

```json
{
  "document_id": "string",
  "schema_name": "string",
  "fields": {},
  "confidence": 0.82,
  "source_support": []
}
```

---

### `compare_documents`

```json
{
  "query_or_fact_pattern": "string",
  "document_ids": ["string"]
}
```

Returns:

```json
{
  "comparison": [
    {
      "document_id": "string",
      "similarities": [],
      "differences": [],
      "important_fields": {},
      "source_support": []
    }
  ]
}
```

---

### `verify_claims`

```json
{
  "claims": ["string"],
  "source_document_ids": ["string"]
}
```

Returns:

```json
{
  "verified": [
    {
      "claim": "string",
      "status": "verified | partial | unsupported",
      "source_url": "string",
      "snippet": "string",
      "paragraph": "string"
    }
  ]
}
```

---

### `generate_answer`

```json
{
  "query": "string",
  "retrieved_document_ids": ["string"],
  "answer_type": "summary | comparison | report | checklist"
}
```

Returns:

```json
{
  "answer": "string",
  "claims": [],
  "sources": [],
  "limitations": []
}
```

---

## 7. Baseline Design System

### Design Goals

The UI should communicate:

- Trust
- Source grounding
- Professionalism
- Speed
- Legal research usefulness

### Base Color Palette

```text
Background: #F8FAFC
Surface: #FFFFFF
Primary: #0F172A
Secondary: #334155
Muted text: #64748B
Border: #E2E8F0
Accent: #2563EB
Verified: #16A34A
Warning: #D97706
Error: #DC2626
```

### Typography

Use a clean sans-serif font.

Recommended hierarchy:

```text
Page title: 24–32px, semibold
Section title: 18–20px, semibold
Body: 14–16px
Metadata: 12–13px
Table text: 13–14px
```

### Component Set

Every idea can reuse these components:

- `SearchPanel`
- `FilterBar`
- `ResultCard`
- `ComparisonTable`
- `SourceSnippet`
- `VerificationBadge`
- `DatasetStatus`
- `AnswerPanel`
- `SourceViewer`
- `ExportButton`

### Verification Badges

```text
Verified        Green
Partially found Amber
Unsupported     Red
Not checked     Gray
```

---

## 8. Baseline Demo UX

The demo should always show three things clearly:

1. What public data was searched
2. What answer was generated
3. What sources support the answer

Recommended demo sequence:

```text
1. Show dataset status
2. Ask a realistic user query
3. Show top retrieved sources
4. Show generated answer or comparison
5. Click verification panel
6. Show source snippets
7. Explain unsupported claims are removed or flagged
```

This works for almost any idea.

---

## 9. Baseline Project Variants

This architecture can support multiple hackathon ideas.

### Variant A — PI Case Comparator

Reuse baseline modules:

- Ingestion: public cases
- Extraction: injury, accident, damages
- Retrieval: similar case search
- Reasoning: damages comparison
- Verification: source snippets

Main UI:

- Case comparison table

---

### Variant B — Citation Verifier

Reuse baseline modules:

- Ingestion: legal memo or draft
- Retrieval: cited public cases
- Extraction: claims from memo
- Verification: claim-to-source matching

Main UI:

- Claim verification checklist

---

### Variant C — Legal Intake Assistant

Reuse baseline modules:

- Ingestion: public legal guidance and forms
- Extraction: deadlines, requirements, document checklist
- Retrieval: guidance search
- Reasoning: intake summary
- Verification: source-backed checklist

Main UI:

- Intake timeline and missing-docs checklist

---

### Variant D — Court Trend Analyzer

Reuse baseline modules:

- Ingestion: public decisions
- Extraction: court, judge, issue, outcome, award
- Retrieval: filtered case search
- Reasoning: trend summaries
- Verification: source-backed charts

Main UI:

- Analytics dashboard

---

### Variant E — Public Records Research Agent

Reuse baseline modules:

- Ingestion: court records, government data, public web
- Extraction: entities, dates, records, relationships
- Retrieval: entity search
- Reasoning: research report
- Verification: public source links

Main UI:

- Research report and entity graph

---

## 10. Baseline Engineering Priorities

### Priority 1 — Reliable Source Tracking

Every document, chunk, metadata field, and generated claim should trace back to a public URL.

Do this before making the UI fancy.

---

### Priority 2 — Working Search

The system must handle fresh judge queries.

Use both:

- Keyword search
- Vector search

---

### Priority 3 — Structured Extraction

The system should produce useful fields, not just summaries.

Structured fields make comparison, filtering, and verification possible.

---

### Priority 4 — Verification

Verification is what separates the project from a generic chatbot.

Always show source snippets.

---

### Priority 5 — Demo Polish

Once the pipeline works, polish the UI enough that judges understand the value in under 30 seconds.

---

## 11. Minimal Version to Build First

If time is short, build this:

```text
1 public source
50–100 documents
basic parser
basic chunks
embeddings
search endpoint
answer endpoint
source links
simple UI
OpenClaw chat tool
```

Minimum demo:

```text
User query → retrieved public documents → source-backed summary
```

This is enough for almost any idea.

---

## 12. Strong Version to Build If Time Allows

If the base works, add:

```text
structured extraction
comparison tables
verification badges
source snippet viewer
dataset status panel
exportable report
OpenClaw slash commands
```

Strong demo:

```text
User query → retrieved docs → structured comparison → verified claims → source snippets
```

---

## 13. OpenClaw Command Ideas

Reusable commands for any project:

```text
/search [query]
```

Find relevant public documents.

```text
/compare [document ids or selected results]
```

Compare selected documents.

```text
/verify
```

Show source support for the current answer.

```text
/sources
```

List public sources used.

```text
/export
```

Create a research summary or report.

```text
/status
```

Show indexed document count and system health.

---

## 14. Baseline Agent Safety Rules

The agent should always follow these rules:

```text
1. Do not answer factual legal questions without using retrieval tools.
2. Do not invent cases, citations, damages numbers, dates, or statutes.
3. If sources conflict, say they conflict.
4. If a claim is unsupported, mark it unsupported.
5. Do not provide legal advice.
6. Always show public source links for important claims.
7. Be clear about dataset limits.
```

Recommended disclaimer:

```text
This is a public-source legal research prototype, not legal advice. Results are limited to indexed public sources and should be verified against the original documents.
```

---

## 15. Common Failure Modes

### Failure Mode 1 — Generic Chatbot

Problem:

```text
The system answers from model memory instead of public sources.
```

Fix:

```text
Force retrieval before answering. Show source snippets.
```

---

### Failure Mode 2 — No Traceability

Problem:

```text
The answer sounds good, but judges cannot verify it.
```

Fix:

```text
Attach source URL and paragraph/snippet to every claim.
```

---

### Failure Mode 3 — Too Broad

Problem:

```text
The team tries to cover every area of law.
```

Fix:

```text
Pick one jurisdiction, one legal domain, one source type, and one workflow.
```

---

### Failure Mode 4 — Bad Search Results

Problem:

```text
Vector search retrieves vaguely related documents.
```

Fix:

```text
Add keyword filters, metadata filters, and query expansion.
```

---

### Failure Mode 5 — Overbuilt UI, Weak Pipeline

Problem:

```text
The app looks nice but does not retrieve or verify correctly.
```

Fix:

```text
Build source tracking, search, and verification first.
```

---

## 16. Team Roles for Any Idea

For a 5-person team, reuse this split:

### Person 1 — Data Lead

Owns:

- Source discovery
- Ingestion
- Raw data storage
- Deduplication

### Person 2 — Extraction Lead

Owns:

- LLM schemas
- Metadata extraction
- Field confidence
- Structured outputs

### Person 3 — Retrieval Lead

Owns:

- Chunking
- Embeddings
- Search quality
- Ranking

### Person 4 — Agent / Backend Lead

Owns:

- API endpoints
- OpenClaw tools
- Agent workflow
- Prompting

### Person 5 — Product / Demo Lead

Owns:

- UI
- Demo script
- Visual design
- Pitch
- Fallback flow

---

## 17. Baseline 24-Hour Timeline

### Hours 0–2 — Decide Idea and Schema

- Pick one use case
- Pick one public source
- Define extracted fields
- Assign team roles

### Hours 2–6 — Build First Data Loop

- Ingest 20–50 documents
- Parse text
- Store source URLs
- Create first search endpoint

### Hours 6–10 — Add Extraction and Indexing

- Extract structured fields
- Chunk documents
- Build vector index
- Add hybrid retrieval

### Hours 10–14 — Add Agent and UI

- Connect OpenClaw tool calls
- Build query UI
- Show results
- Show source links

### Hours 14–18 — Add Verification

- Claim extraction
- Source snippet matching
- Verification badges
- Unsupported claim behavior

### Hours 18–22 — Polish Demo

- Improve UI
- Add dataset status
- Prepare 3 demo queries
- Handle errors

### Hours 22–24 — Practice and Freeze

- Practice demo
- Freeze code
- Prepare fallback screenshots
- Finalize pitch

---

## 18. Baseline README Template

```md
# Project Name

One-line description.

## Problem

What messy public legal data problem are we solving?

## Solution

How our OpenClaw-powered agent helps.

## Core Workflow

Public data → ingestion → extraction → search → answer → verification.

## Features

- Public data ingestion
- Structured extraction
- Semantic search
- Source-grounded answers
- Claim verification
- OpenClaw agent interface

## Demo Query

\```text
Example realistic user query here.
\```

## Architecture

\```text
Public sources → parser → metadata extraction → vector index → retrieval API → OpenClaw agent → UI
\```

## Setup

\```bash
pip install -r requirements.txt
python backend/main.py
\```

## Trust and Safety

The system only answers from retrieved public sources. Unsupported claims are marked as unverified.

## Disclaimer

This is a hackathon prototype for legal research assistance, not legal advice.
```

---

## 19. Final Baseline Recommendation

No matter which idea the team chooses, build around this minimum architecture:

```text
Public source ingestion
+ source-preserving chunks
+ structured extraction
+ hybrid retrieval
+ OpenClaw tools
+ source-grounded answers
+ verification UI
```

That baseline gives you flexibility to pivot ideas while preserving the same technical foundation.

The winning pattern is:

```text
Not: an AI that talks about legal topics.

Yes: an agent that finds public legal evidence, organizes it, compares it, and proves where every claim came from.
```

