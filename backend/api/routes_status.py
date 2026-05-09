"""GET /status — sanity endpoint reporting indexed counts and last eval result.

The payload is the contract for the frontend `DatasetStatus` panel.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from sqlalchemy import func, select

from backend.api.schemas import StatusResponse
from backend.config import DATA_DIR
from backend.db import get_session
from backend.models import Document, Statute

router = APIRouter(tags=["status"])

log = logging.getLogger(__name__)

_EVAL_REPORT_PATH = DATA_DIR / "exports" / "eval_report.json"


@router.get("/status", response_model=StatusResponse)
def get_status() -> StatusResponse:
    with get_session() as session:
        document_count = session.scalar(select(func.count()).select_from(Document)) or 0
        sample_urls = list(session.scalars(select(Document.url).limit(5)).all())

        statute_count = session.scalar(select(func.count()).select_from(Statute)) or 0
        jurisdictions = list(
            session.scalars(
                select(Statute.jurisdiction).distinct().order_by(Statute.jurisdiction)
            ).all()
        )

    eval_meta = _read_eval_report()

    return StatusResponse(
        indexed_documents=int(document_count),
        sample_urls=sample_urls,
        indexed_statutes=int(statute_count),
        jurisdictions=jurisdictions,
        last_eval_run_at=eval_meta.get("run_at"),
        last_eval_recall_at_5=eval_meta.get("factor_recall_at_5"),
        last_eval_citation_recall_at_1=eval_meta.get("citation_recall_at_1"),
    )


def _read_eval_report() -> dict:
    """Best-effort read of `data/exports/eval_report.json`. Returns `{}` on
    any failure — the eval harness owns the file, this endpoint just surfaces
    its values to the UI."""

    if not _EVAL_REPORT_PATH.exists():
        return {}
    try:
        with _EVAL_REPORT_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:
        log.warning("status: failed to read %s (%s)", _EVAL_REPORT_PATH, exc)
        return {}

    parsed: dict = {}
    raw_run_at = data.get("run_at")
    if isinstance(raw_run_at, str):
        try:
            parsed["run_at"] = datetime.fromisoformat(raw_run_at)
        except ValueError:
            log.warning("status: bad run_at in eval_report.json: %r", raw_run_at)

    for key in ("citation_recall_at_1", "factor_recall_at_5"):
        value = data.get(key)
        if isinstance(value, (int, float)):
            parsed[key] = float(value)

    return parsed


def _ensure_data_path_exists() -> None:
    """Create the parent dir for eval_report.json so the eval harness has a place to write."""

    Path(_EVAL_REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)


_ensure_data_path_exists()
