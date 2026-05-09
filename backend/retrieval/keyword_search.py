"""SQLite FTS5 keyword search over the Statute table.

FTS5 ships with stock SQLite, no extra deps. We mirror the searchable columns
into a virtual table `statute_fts` and rank with `bm25(statute_fts)`.

Sync strategy: rebuild from scratch after each ingest. ~1,500 statutes,
sub-second. Triggers + incremental updates aren't worth the complexity at
hackathon scale.

Query sanitization: FTS5 has its own query syntax (operators like `*`,
`AND`, `NEAR`, `"phrase"`) that errors on stray punctuation in user input.
We tokenize on word characters and quote each token, which makes everything
a phrase-search-friendly literal — safe for arbitrary input from the search
box.
"""

from __future__ import annotations

import logging
import re
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

_TABLE_NAME = "statute_fts"

_WORD_RE = re.compile(r"\w+", re.UNICODE)


def _create_table(session: Session) -> None:
    """Idempotent: create the FTS5 virtual table if missing.

    `UNINDEXED` on `statute_id` keeps it queryable in the SELECT clause
    without contributing to the search index — we only match against
    `universal_citation`, `statute_text`, `complete_statute`.
    """

    session.execute(
        text(
            f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS {_TABLE_NAME} USING fts5(
                statute_id UNINDEXED,
                universal_citation,
                statute_text,
                complete_statute,
                tokenize='porter unicode61'
            )
            """
        )
    )


def rebuild_fts(session: Session) -> int:
    """Drop, recreate, and repopulate the FTS5 table from `statutes`.

    Returns the row count written. Caller commits the session.
    """

    session.execute(text(f"DROP TABLE IF EXISTS {_TABLE_NAME}"))
    _create_table(session)
    result = session.execute(
        text(
            f"""
            INSERT INTO {_TABLE_NAME} (statute_id, universal_citation, statute_text, complete_statute)
            SELECT statute_id, universal_citation, statute_text, complete_statute
            FROM statutes
            """
        )
    )
    written = int(result.rowcount or 0)
    log.info("keyword_search: rebuilt %s with %d rows", _TABLE_NAME, written)
    return written


def _sanitize_query(query: str) -> str:
    """Tokenize on word characters, quote each token. Empty result if no
    valid tokens — caller must treat that as 'no keyword hits'."""

    tokens = _WORD_RE.findall(query or "")
    return " ".join(f'"{tok}"' for tok in tokens)


def keyword_search(
    session: Session,
    query: str,
    allow_ids: Sequence[str] | None = None,
    top_k: int = 50,
) -> list[tuple[str, float]]:
    """Return `(statute_id, score)` pairs ordered best-first.

    BM25 in FTS5 returns negative numbers where more-negative = better match;
    we negate so callers get higher = better. `allow_ids=[]` returns no
    results (caller-intended); `None` means no allowlist.
    """

    if allow_ids is not None and len(allow_ids) == 0:
        return []

    safe_query = _sanitize_query(query)
    if not safe_query:
        return []

    sql = f"""
        SELECT statute_id, bm25({_TABLE_NAME}) AS rank
        FROM {_TABLE_NAME}
        WHERE {_TABLE_NAME} MATCH :query
    """
    params: dict = {"query": safe_query, "limit": top_k}

    if allow_ids:
        placeholders = ", ".join(f":id_{i}" for i in range(len(allow_ids)))
        sql += f" AND statute_id IN ({placeholders})"
        for i, sid in enumerate(allow_ids):
            params[f"id_{i}"] = sid

    sql += " ORDER BY rank ASC LIMIT :limit"

    try:
        rows = session.execute(text(sql), params).all()
    except Exception as exc:
        log.warning("keyword_search: FTS5 query failed for %r (%s)", query, exc)
        return []

    return [(row[0], -float(row[1])) for row in rows]


def fts_count(session: Session) -> int:
    """Total rows in the FTS5 table. Used as a sanity check at boot."""

    try:
        row = session.execute(text(f"SELECT COUNT(*) FROM {_TABLE_NAME}")).one()
        return int(row[0])
    except Exception:
        return 0
