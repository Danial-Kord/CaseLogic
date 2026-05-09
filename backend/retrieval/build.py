"""(Re)build the retrieval indices from the `statutes` table.

Run with:

    python -m backend.retrieval.build              # incremental upsert + FTS rebuild
    python -m backend.retrieval.build --reset      # drop and rebuild Chroma too

Idempotent. Designed to be called by Person 1's ingestion CLI as the final
step (`ingest --jurisdiction CA --code VEH && python -m backend.retrieval.build`),
and by Person 6's eval harness before each run.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time

from sqlalchemy import select

from backend.db import get_session, init_db
from backend.models import Statute
from backend.retrieval.keyword_search import fts_count, rebuild_fts
from backend.retrieval.vector_store import (
    collection_count,
    reset_collection,
    upsert_statutes,
)

log = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rebuild retrieval indices.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop the Chroma collection before reindexing (forces a clean rebuild).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Less chatty logging.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.WARNING if args.quiet else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    init_db()

    if args.reset:
        log.info("build: resetting Chroma collection")
        reset_collection()

    started = time.perf_counter()

    with get_session() as session:
        statutes = list(session.scalars(select(Statute)).all())
        if not statutes:
            print(
                "[build] No rows in `statutes` table. Run ingestion first "
                "(Person 1's adapter CLI).",
                file=sys.stderr,
            )
            return 2

        vector_count = upsert_statutes(statutes)
        fts_written = rebuild_fts(session)

    elapsed = time.perf_counter() - started
    print(
        f"[build] indexed {vector_count} statutes "
        f"(vector={collection_count()}, fts={fts_count_after()}) in {elapsed:.1f}s"
    )
    if fts_written != vector_count:
        print(
            f"[build] WARN: FTS row count ({fts_written}) != vector count ({vector_count})",
            file=sys.stderr,
        )
    return 0


def fts_count_after() -> int:
    """Open a fresh session because `rebuild_fts` ran in a now-closed scope."""

    with get_session() as session:
        return fts_count(session)


if __name__ == "__main__":
    raise SystemExit(main())
