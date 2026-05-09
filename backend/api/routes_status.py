"""GET /status — sanity endpoint reporting indexed document counts."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from backend.db import get_session
from backend.models import Document


router = APIRouter(tags=["status"])


class StatusResponse(BaseModel):
    indexed_documents: int
    sample_urls: list[str]


@router.get("/status", response_model=StatusResponse)
def get_status() -> StatusResponse:
    with get_session() as session:
        count = session.scalar(select(func.count()).select_from(Document)) or 0
        sample = session.scalars(select(Document.url).limit(5)).all()
    return StatusResponse(indexed_documents=int(count), sample_urls=list(sample))
