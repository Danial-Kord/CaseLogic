"""ORM models.

`Document` is the generic web/case-law row used by the existing ingestion pipeline
(Phase 2 / Organizer extension). `Statute` + `StatuteFactor` are the Phase-1 core:
one row per vehicle-code section (with its subdivision), plus a many-to-many tag
table for the 17-factor taxonomy in `backend.extraction.factors`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    """One row per vehicle-code section (with its subdivision when present).

    `statute_id` is the slug used as the public identifier across the API,
    Chroma collection, and FTS5 table — e.g. `ca-veh-22350`, `ca-veh-21451-a`.
    Person 1 (Data Lead) owns slug generation at ingest time.

    `subdivision` stores '' (empty string) for bare sections so the unique
    constraint works reliably in SQLite (NULL != NULL in unique indexes).
    """

    __tablename__ = "statutes"
    __table_args__ = (
        UniqueConstraint(
            "jurisdiction",
            "code_name",
            "section_number",
            "subdivision",
            name="uq_statutes_jurisdiction_code_section_subdivision",
        ),
        Index("ix_statutes_jurisdiction_code", "jurisdiction", "code_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    statute_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    jurisdiction: Mapped[str] = mapped_column(String(64), index=True)
    code_name: Mapped[str] = mapped_column(String(128))
    section_number: Mapped[str] = mapped_column(String(64), index=True)
    universal_citation: Mapped[str] = mapped_column(String(256), index=True)
    # '' for bare sections (e.g. § 22350), '(a)' or '(a)-(b)' for subdivisions
    subdivision: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # String(512): leginfo division strings run ~100 chars incl. enactment notes
    division: Mapped[str | None] = mapped_column(String(512), nullable=True)
    chapter: Mapped[str | None] = mapped_column(String(512), nullable=True)
    statute_text: Mapped[str] = mapped_column(Text)
    complete_statute: Mapped[str] = mapped_column(Text)
    official_url: Mapped[str] = mapped_column(String(2048))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    factors: Mapped[list["StatuteFactor"]] = relationship(
        "StatuteFactor",
        back_populates="statute",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class StatuteFactor(Base):
    """Many-to-many tag from a statute to one of the 17 contributing-factor strings.

    `factor` is byte-exact a value from `backend.extraction.factors.FACTORS`.
    `quote` is the verbatim snippet from the statute that justifies the tag —
    required for traceability per the hackathon ground rules.
    """

    __tablename__ = "statute_factors"
    __table_args__ = (
        UniqueConstraint(
            "statute_id",
            "factor",
            name="uq_statute_factors_statute_factor",
        ),
        Index("ix_statute_factors_factor", "factor"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    statute_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("statutes.statute_id", ondelete="CASCADE"),
        index=True,
    )
    factor: Mapped[str] = mapped_column(String(128))
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    quote: Mapped[str | None] = mapped_column(Text, nullable=True)

    statute: Mapped["Statute"] = relationship("Statute", back_populates="factors")
