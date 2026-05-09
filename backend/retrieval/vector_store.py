"""Chroma persistent vector index over CA Vehicle Code statutes.

Chroma's default embedding function (`all-MiniLM-L6-v2`) is used — no extra
deps, no extra API key, embedding happens inside Chroma at `add()` and
`query()` time. For ~1,500 short statute sections this is plenty.

Contract:

- One collection named `ca_statutes`.
- IDs are `statute_id` slugs (e.g. `ca-veh-22350`, `ca-veh-21451-a`).
- Documents are `make_contextual_text(statute)` — prefix + body.
- Metadata holds the scalar fields we want to filter by (Chroma metadata
  is scalar-only, so the many-valued `factors` are filtered through SQL
  in `hybrid_search.retrieve()`, not here).
"""

from __future__ import annotations

import logging
from typing import Iterable, Sequence

from backend.config import load_settings
from backend.models import Statute
from backend.retrieval.embeddings import make_contextual_text

log = logging.getLogger(__name__)

COLLECTION_NAME = "ca_statutes"

_client = None


def _get_client():
    """Lazy-init the Chroma persistent client. Importing chromadb at module
    import time is slow; defer until something actually needs it."""

    global _client
    if _client is not None:
        return _client

    import chromadb

    settings = load_settings()
    _client = chromadb.PersistentClient(path=settings.vector_index_path)
    return _client


def get_collection():
    """Return (or create) the `ca_statutes` collection."""

    client = _get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def reset_collection() -> None:
    """Drop and recreate the collection. Used by `python -m backend.retrieval.build`
    when invoked with `--reset`."""

    client = _get_client()
    try:
        client.delete_collection(name=COLLECTION_NAME)
    except Exception:
        pass
    client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def _statute_metadata(statute: Statute) -> dict:
    """Scalar-only metadata payload. `statute_id` is duplicated here (also the
    Chroma row ID) so we can use `where={"statute_id": {"$in": [...]}}` to
    filter by the SQL allowlist when a factor is set — Chroma's `query()`
    has no direct ID-set filter."""

    return {
        "statute_id": statute.statute_id,
        "jurisdiction": statute.jurisdiction,
        "code_name": statute.code_name,
        "section_number": statute.section_number,
        "subdivision": statute.subdivision or "",
        "division": statute.division or "",
        "chapter": statute.chapter or "",
        "official_url": statute.official_url,
    }


def upsert_statutes(statutes: Iterable[Statute], batch_size: int = 256) -> int:
    """Idempotently insert/update statutes into the vector index.

    Chroma's `upsert()` is what we want — `add()` errors on duplicate IDs,
    `update()` errors on missing ones. Returns the count of rows written.
    """

    collection = get_collection()
    written = 0
    batch_ids: list[str] = []
    batch_docs: list[str] = []
    batch_meta: list[dict] = []

    for statute in statutes:
        batch_ids.append(statute.statute_id)
        batch_docs.append(make_contextual_text(statute))
        batch_meta.append(_statute_metadata(statute))
        if len(batch_ids) >= batch_size:
            collection.upsert(ids=batch_ids, documents=batch_docs, metadatas=batch_meta)
            written += len(batch_ids)
            batch_ids, batch_docs, batch_meta = [], [], []

    if batch_ids:
        collection.upsert(ids=batch_ids, documents=batch_docs, metadatas=batch_meta)
        written += len(batch_ids)

    log.info("vector_store: upserted %d statutes", written)
    return written


def vector_search(
    query: str,
    allow_ids: Sequence[str] | None = None,
    top_k: int = 50,
) -> list[tuple[str, float]]:
    """Return `(statute_id, similarity_score)` pairs ordered best-first.

    `allow_ids`, if non-empty, restricts results to that set via metadata
    filter. An empty allowlist returns no results (caller-intended) rather
    than ignoring the filter.

    Score is `1 - distance` so higher = better, normalized to roughly [0, 1]
    for the cosine space we configured the collection with.
    """

    if allow_ids is not None and len(allow_ids) == 0:
        return []

    collection = get_collection()
    where = None
    if allow_ids:
        where = {"statute_id": {"$in": list(allow_ids)}}

    response = collection.query(
        query_texts=[query],
        n_results=top_k,
        where=where,
        include=["distances"],
    )

    ids = (response.get("ids") or [[]])[0]
    distances = (response.get("distances") or [[]])[0]

    hits: list[tuple[str, float]] = []
    for statute_id, distance in zip(ids, distances):
        score = 1.0 - float(distance) if distance is not None else 0.0
        hits.append((statute_id, score))
    return hits


def collection_count() -> int:
    """Total number of statutes in the vector index. Used by `/status`."""

    try:
        return get_collection().count()
    except Exception:
        return 0
