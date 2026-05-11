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
    required for traceability per the project ground rules.
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


class ChatSession(Base):
    """One conversation thread. `session_id` is a UUID string used as the
    public identifier in the API; `id` stays internal.

    `title` is optional and is auto-generated from the first user message
    after the first assistant turn lands.
    """

    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ChatMessage.turn_index",
    )


class Profile(Base):
    """Single-user demo profile. Always row id=1 (singleton). Free-text
    `about` field is concatenated into the chat system prompt so the LLM
    can tailor its response style."""

    __tablename__ = "profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    role: Mapped[str] = mapped_column(String(128), default="")
    firm: Mapped[str] = mapped_column(String(256), default="")
    about: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Plan(Base):
    """One generated research plan.

    A plan is the product of the planning agent: the user supplies an
    incident description, and the orchestrator runs three sub-agents
    (related cases, people to reach out, recommended brief) over the
    statutes retrieved for that incident. Each sub-agent's output is
    persisted as a sibling `PlanSection` row.

    `plan_id` is a UUID-shaped slug used as the public identifier — same
    pattern as `ChatSession.session_id`. `title` is auto-generated from
    the first ~80 chars of `incident_text`; users don't currently rename.

    `status` transitions: "running" -> "done" on a successful generation,
    or "running" -> "error" if any sub-agent or the orchestrator itself
    raises. We never delete partial plans on error — keeping them lets
    the user see how far we got and is useful for debugging hung runs.
    """

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    incident_text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="running")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    sections: Mapped[list["PlanSection"]] = relationship(
        "PlanSection",
        back_populates="plan",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PlanSection.id",
    )


class PlanSection(Base):
    """One section produced by a sub-agent within a plan.

    `kind` is byte-exact one of:
      - "related_cases" — related-cases sub-agent output
      - "contacts"      — people-to-reach-out sub-agent (roles only)
      - "brief"         — recommended brief outline

    `content_md` is markdown the frontend renders directly.
    `metadata_json` carries auxiliary data — currently the cited statute
    slugs so the UI can render clickable chips that open the full text.
    """

    __tablename__ = "plan_sections"
    __table_args__ = (
        UniqueConstraint("plan_id_fk", "kind", name="uq_plan_sections_plan_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id_fk: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("plans.plan_id", ondelete="CASCADE"),
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(32))
    content_md: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    plan: Mapped["Plan"] = relationship("Plan", back_populates="sections")


class ChatMessage(Base):
    """One message inside a chat session.

    `content_json` stores the full Anthropic message-block list as JSON
    (`[{type:"text",...}, {type:"tool_use",...}, {type:"tool_result",...}]`)
    so replaying the conversation back into the LLM is lossless.

    `hits_json` is set only on the *final* assistant message of a turn (the
    one carrying the user-visible answer text). It stores a JSON list of
    enriched `StatuteHit` records — full statute rows joined from the
    `statutes` table — so the frontend can re-render result cards when a
    chat is reloaded without recomputing retrieval. Earlier assistant rows
    in the same turn (the ones whose only purpose was to issue tool_use
    blocks) leave this NULL.

    `verification_json` is set on the same final assistant row, alongside
    `hits_json`. It stores the JSON-serialized `VerificationReport`
    (citation + quote audit) so the frontend can re-render the warning
    badge on chat reload without re-running the verifier.

    `role` is one of:
      - 'user'         — user-authored prompt
      - 'assistant'    — Claude's response (may contain text + tool_use blocks)
      - 'tool_result'  — our tool execution feedback (sent as role='user' in
                         the Anthropic API but tagged separately here so the
                         frontend can hide them or render them differently).
    """

    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_session_turn", "session_id_fk", "turn_index"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id_fk: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("chat_sessions.session_id", ondelete="CASCADE"),
        index=True,
    )
    turn_index: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))
    content_json: Mapped[str] = mapped_column(Text)
    hits_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    session: Mapped["ChatSession"] = relationship(
        "ChatSession", back_populates="messages"
    )
