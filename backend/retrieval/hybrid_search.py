"""Hybrid retrieval: citation fast-path + RRF over vector and keyword search.

Order of operations:

1. **Citation fast-path** — `parse_citation(query)` resolves the input to a
   `statute_id` slug. If it hits a row, we short-circuit and return that
   one statute with score 1.0. This guarantees citation recall@1 = 1.0 on
   the released CSV without any retrieval involved.

2. **Factor pre-filter (SQL)** — if `factor` is set, build a `statute_id`
   allowlist from `StatuteFactor`. Both backends respect the allowlist.
   `factor` is byte-exact a value from `extraction.factors.FACTORS`.

3. **Backends in parallel** — vector top-50 (Chroma) and keyword top-50
   (FTS5 + BM25). Either backend may return fewer; RRF tolerates ragged
   inputs.

4. **RRF merge** — Reciprocal Rank Fusion with k=60 (Cormack et al. 2009).
   Weights are equal for v1; if eval shows keyword dominates, tune later.

5. **Hydrate** — single SQL query loads the top-k statute rows + their
   factor tags. Return `StatuteHit` objects.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_session
from backend.models import Statute, StatuteFactor
from backend.retrieval import StatuteHit, parse_citation
from backend.retrieval.keyword_search import keyword_search
from backend.retrieval.vector_store import vector_search

log = logging.getLogger(__name__)

RRF_K = 60
"""Reciprocal Rank Fusion smoothing constant. 60 is the canonical default."""

CANDIDATE_TOP_K = 50
"""How many results to pull from each backend before merging."""


def retrieve(
    query: str,
    factor: str | None = None,
    top_k: int = 10,
) -> list[StatuteHit]:
    """Public entry point. See module docstring for the pipeline."""

    if not query or not query.strip():
        return []

    with get_session() as session:
        # 1. Citation fast-path
        slug = parse_citation(query)
        if slug:
            hit = _exact_lookup(session, slug)
            if hit is not None:
                hit.matched_via = "citation"
                return [hit]

        # 2. Factor pre-filter
        allow_ids: list[str] | None = None
        if factor:
            allow_ids = _statute_ids_for_factor(session, factor)
            if not allow_ids:
                log.info("retrieve: factor %r matched zero statutes", factor)
                return []

        # 3. Backends
        vector_hits = vector_search(query, allow_ids=allow_ids, top_k=CANDIDATE_TOP_K)
        keyword_hits = keyword_search(
            session, query, allow_ids=allow_ids, top_k=CANDIDATE_TOP_K
        )

        # 4. RRF merge
        merged = _rrf_merge([_just_ids(vector_hits), _just_ids(keyword_hits)], k=RRF_K)
        if not merged:
            return []

        # 5. Hydrate
        top_ids = [statute_id for statute_id, _ in merged[:top_k]]
        score_map = dict(merged[:top_k])
        per_backend = _per_backend_provenance(vector_hits, keyword_hits, top_ids)
        return _hydrate(session, top_ids, score_map, per_backend)


def _exact_lookup(session: Session, statute_id: str) -> StatuteHit | None:
    statute = session.scalar(
        select(Statute)
        .where(Statute.statute_id == statute_id)
        .options(selectinload(Statute.factors))
    )
    if statute is None:
        return None
    return _to_hit(statute, score=1.0, matched_via="citation")


def _statute_ids_for_factor(session: Session, factor: str) -> list[str]:
    rows = session.execute(
        select(StatuteFactor.statute_id).where(StatuteFactor.factor == factor).distinct()
    ).all()
    return [row[0] for row in rows]


def _just_ids(scored: Iterable[tuple[str, float]]) -> list[str]:
    return [sid for sid, _ in scored]


def _rrf_merge(rankings: list[list[str]], k: int = RRF_K) -> list[tuple[str, float]]:
    """RRF: sum of `1 / (k + rank)` across rankings. Ties broken by insertion."""

    scores: defaultdict[str, float] = defaultdict(float)
    for ranking in rankings:
        for rank, statute_id in enumerate(ranking):
            scores[statute_id] += 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda item: item[1], reverse=True)


def _per_backend_provenance(
    vector_hits: list[tuple[str, float]],
    keyword_hits: list[tuple[str, float]],
    top_ids: list[str],
) -> dict[str, str]:
    """Record which backend(s) surfaced each hit. Used for the `matched_via`
    field — useful for debugging and for the demo to call out 'this hit was
    semantic'."""

    vector_set = {sid for sid, _ in vector_hits}
    keyword_set = {sid for sid, _ in keyword_hits}
    provenance: dict[str, str] = {}
    for sid in top_ids:
        in_v = sid in vector_set
        in_k = sid in keyword_set
        if in_v and in_k:
            provenance[sid] = "hybrid"
        elif in_v:
            provenance[sid] = "vector"
        elif in_k:
            provenance[sid] = "keyword"
        else:
            provenance[sid] = "hybrid"
    return provenance


def _hydrate(
    session: Session,
    statute_ids: list[str],
    score_map: dict[str, float],
    matched_via: dict[str, str],
) -> list[StatuteHit]:
    """One query loads the rows; preserve the RRF order from `statute_ids`."""

    rows = session.scalars(
        select(Statute)
        .where(Statute.statute_id.in_(statute_ids))
        .options(selectinload(Statute.factors))
    ).all()
    by_id = {row.statute_id: row for row in rows}

    hits: list[StatuteHit] = []
    for sid in statute_ids:
        statute = by_id.get(sid)
        if statute is None:
            continue
        hits.append(
            _to_hit(
                statute,
                score=score_map.get(sid, 0.0),
                matched_via=matched_via.get(sid, "hybrid"),
            )
        )
    return hits


def _to_hit(statute: Statute, *, score: float, matched_via: str) -> StatuteHit:
    return StatuteHit(
        statute_id=statute.statute_id,
        universal_citation=statute.universal_citation,
        jurisdiction=statute.jurisdiction,
        code_name=statute.code_name,
        section_number=statute.section_number,
        subdivision=statute.subdivision,
        division=statute.division,
        chapter=statute.chapter,
        statute_text=statute.statute_text,
        complete_statute=statute.complete_statute,
        official_url=statute.official_url,
        score=score,
        factors=sorted({f.factor for f in statute.factors}),
        matched_via=matched_via,
    )
