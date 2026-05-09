# Phase-1 API contract

Source of truth for the frontend (Person 5) and the eval harness (Person 6). Mirrors the FastAPI OpenAPI snapshot at `http://localhost:8000/docs` while the backend is running.

Base URL during development: `http://localhost:8000`. CORS allows `http://localhost:3000`.

Phase 1 ships exactly four endpoints:

- `GET /statutes/{statute_id}` — exact statute lookup
- `POST /statutes/search` — hybrid search with optional factor filter
- `GET /factors` — list the 17 contributing-factor categories with counts
- `GET /status` — dataset and eval health

Plus the legacy `GET /healthz` (returns `{"ok": true}`) and the existing `POST /ingest/url` / `POST /ingest/search` from the pre-Phase-1 web pipeline.

---

## `GET /statutes/{statute_id}`

Resolve a statute by its canonical slug.

### Path parameters

| Name | Type | Notes |
|---|---|---|
| `statute_id` | string | Slug matching `^[a-z0-9-]+$`. Examples: `ca-veh-22350`, `ca-veh-21451-a`. |

### Responses

- **200** — `StatuteOut` payload below.
- **400** — slug doesn't match `^[a-z0-9-]+$`. Body: `{"detail": "invalid statute_id slug: ..."}`.
- **404** — slug not found. Body: `{"detail": "statute not found"}`.

### `StatuteOut` shape

```json
{
  "statute_id": "ca-veh-22350",
  "universal_citation": "Cal. Veh. Code § 22350",
  "jurisdiction": "California",
  "code_name": "Cal. Veh. Code",
  "section_number": "22350",
  "subdivision": null,
  "division": "Division 11",
  "chapter": "Chapter 7",
  "statute_text": "[\u201cn]o person shall drive a vehicle upon a highway at a speed greater than is reasonable or prudent\u2026",
  "complete_statute": "Pursuant to Cal. Veh. Code \u00a7 22350, \u201c[n]o person shall drive\u2026",
  "official_url": "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=22350",
  "factors": ["Driving Too Fast For Conditions"],
  "retrieved_at": "2026-05-09T13:55:01.000Z"
}
```

---

## `POST /statutes/search`

Hybrid search. Citation-shaped queries short-circuit to an exact match (recall@1 = 1.0). Free-text queries fan out across BM25 (FTS5) and the Chroma vector index, then RRF-merge.

### Request body — `StatuteSearchRequest`

```json
{
  "query": "running a red light",
  "factor": "Failure to Obey Traffic Control Device",
  "top_k": 5
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | string | yes | 1\u2013512 chars. Free text or a citation. |
| `factor` | string | no | Must byte-exact match a value from `GET /factors`. |
| `top_k` | int | no | Default 10, max 50. |

### Responses

- **200** — `StatuteSearchResponse` below.
- **400** — `factor` not in the locked enum. Body: `{"detail": "unknown factor '...'"}`.
- **422** — Pydantic validation (`query` empty, `top_k` out of range, etc.).

### `StatuteSearchResponse` shape

```json
{
  "query": "running a red light",
  "factor": null,
  "top_k": 5,
  "results": [
    {
      "statute_id": "ca-veh-21453-a",
      "universal_citation": "Cal. Veh. Code § 21453(a)",
      "jurisdiction": "California",
      "code_name": "Cal. Veh. Code",
      "section_number": "21453",
      "subdivision": "a",
      "division": "Division 11",
      "chapter": "Chapter 2",
      "statute_text": "...",
      "complete_statute": "...",
      "official_url": "https://leginfo.legislature.ca.gov/...",
      "score": 0.0327,
      "factors": ["Failure to Obey Traffic Control Device"],
      "matched_via": "vector"
    }
  ]
}
```

`matched_via` is one of `citation`, `vector`, `keyword`, `hybrid`. The frontend can use this to badge "semantic match" vs "exact text match" in `ResultsPanel` if useful.

`score` is the RRF score (sum of `1 / (60 + rank)` across the backends that surfaced this hit) or `1.0` for citation fast-path hits. Values are not directly comparable across queries — they're rank-order signals only.

---

## `GET /factors`

The 17 locked contributing-factor categories with statute counts. Always returns all 17 entries (zero counts included) so the frontend dropdown is stable.

### Response — `FactorsResponse`

```json
{
  "factors": [
    { "factor": "DUI/DWI", "statute_count": 3 },
    { "factor": "Driving Too Fast For Conditions", "statute_count": 2 },
    { "factor": "Failure to Maintain Lane", "statute_count": 2 },
    { "factor": "Failure to Obey Traffic Control Device", "statute_count": 1 },
    { "factor": "Failure to Use/Activate Horn", "statute_count": 1 },
    { "factor": "Failure to Yield at a Yield Sign", "statute_count": 1 },
    { "factor": "Failure to Yield the Right-of-Way", "statute_count": 5 },
    { "factor": "Fleeing a Police Officer", "statute_count": 1 },
    { "factor": "Fleeing the Scene of a Collision", "statute_count": 2 },
    { "factor": "Following Too Closely", "statute_count": 1 },
    { "factor": "Improper Lane of Travel", "statute_count": 3 },
    { "factor": "Improper Passing", "statute_count": 6 },
    { "factor": "Improper Starting", "statute_count": 1 },
    { "factor": "Improper Stopping", "statute_count": 3 },
    { "factor": "Improper Turning", "statute_count": 5 },
    { "factor": "Reckless Driving", "statute_count": 1 },
    { "factor": "Using a Wireless Telephone/Texting While Driving", "statute_count": 2 }
  ]
}
```

The factor strings above are byte-exact the values accepted by `POST /statutes/search`'s `factor` field. Don't normalize, lowercase, or trim — equality is strict.

---

## `GET /status`

Dataset and eval health.

### Response — `StatusResponse`

```json
{
  "indexed_documents": 0,
  "sample_urls": [],
  "indexed_statutes": 1543,
  "jurisdictions": ["California"],
  "last_eval_run_at": "2026-05-09T13:30:00.000Z",
  "last_eval_recall_at_5": 0.87,
  "last_eval_citation_recall_at_1": 1.0
}
```

| Field | Notes |
|---|---|
| `indexed_documents` | Generic web-document count from the legacy `documents` table. Stays for back-compat with the existing `/ingest` flow. |
| `indexed_statutes` | Rows in the `statutes` table. The number that matters for Phase 1. |
| `jurisdictions` | Distinct jurisdictions present. Phase 1 = `["California"]` only. |
| `last_eval_*` | Read from `data/exports/eval_report.json` if present, otherwise `null`. The eval harness (Person 6) writes that file. |

---

## Frontend usage notes

- The citation regex shortcut in `SearchPanel` is allowed to bypass `POST /statutes/search` and call `GET /statutes/{slug}` directly. The result of `parse_citation` is the same on both sides — the slug computed in the browser will match the one the backend would have computed.
- `GET /factors` is safe to cache in the client for the session (the enum is locked).
- 404 from `GET /statutes/{slug}` is the expected path for "statute not found"; render a soft empty state, not a red error.
- All endpoints are idempotent and side-effect-free except the existing `POST /ingest/*` (out of Phase-1 frontend scope).
