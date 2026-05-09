"""ORM models. Phase 2 only fills in `documents`; chunks/metadata/claim_support are
declared but kept minimal until later phases need them."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("url", name="uq_documents_url"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    url: Mapped[str] = mapped_column(String(2048), index=True)
    source_type: Mapped[str] = mapped_column(String(32), default="web")
    jurisdiction: Mapped[str | None] = mapped_column(String(64), nullable=True)
    decision_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Statute(Base):
    """One row per citable unit — a specific section or subdivision.

    § 21453(a) and § 21453(a)-(b) are separate rows because they represent
    distinct legal citations.  `subdivision` uses '' for bare sections so the
    unique constraint works reliably in SQLite (NULL != NULL in unique indexes).
    """

    __tablename__ = "statutes"
    __table_args__ = (
        UniqueConstraint(
            "jurisdiction", "code_name", "section_number", "subdivision",
            name="uq_statute_citation",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # stable slug, e.g. "ca-veh-21453-a-b"
    statute_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    jurisdiction: Mapped[str] = mapped_column(String(64), index=True)
    code_name: Mapped[str] = mapped_column(String(64), index=True)
    # numeric section only, e.g. "21453" or "2800.1"
    section_number: Mapped[str] = mapped_column(String(64), index=True)
    # full citation as it appears in legal documents, e.g. "Cal. Veh. Code § 21453(a)-(b)"
    universal_citation: Mapped[str] = mapped_column(String(256), index=True)
    # subdivision notation, e.g. "(a)", "(a)-(b)", "(a)&(c)"; empty string for bare sections
    subdivision: Mapped[str] = mapped_column(String(64), nullable=False, default="", server_default="")
    division: Mapped[str | None] = mapped_column(String(512), nullable=True)
    chapter: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # quoted subdivision text from the official source
    statute_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # formatted "Pursuant to ..." citation string
    complete_statute: Mapped[str | None] = mapped_column(Text, nullable=True)
    official_url: Mapped[str] = mapped_column(String(2048))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
