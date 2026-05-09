"""SQLAlchemy engine, session, and base metadata."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import load_settings


class Base(DeclarativeBase):
    pass


_settings = load_settings()

_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
engine: Engine = create_engine(_settings.database_url, future=True, connect_args=_connect_args)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    """Create tables if they don't exist. Safe to call on every app boot."""
    # Importing models here ensures their tables register on Base.metadata before create_all.
    from backend import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()


def _apply_lightweight_migrations() -> None:
    """Hand-rolled, idempotent migrations for SQLite dev databases.

    We don't run Alembic in this repo (hackathon scope), so when we add a
    column to an existing model we have to upgrade live databases here.
    Each migration must be safe to re-run — we swallow the OperationalError
    that SQLite raises when the column already exists.
    """

    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    if not _settings.database_url.startswith("sqlite"):
        return

    statements = [
        # 2026-05-09: chat_messages.hits_json — frontend-renderable hits per
        # final assistant message. Older rows stay NULL.
        "ALTER TABLE chat_messages ADD COLUMN hits_json TEXT",
    ]

    with engine.begin() as conn:
        for sql in statements:
            try:
                conn.execute(text(sql))
            except OperationalError:
                # Column already exists, or table doesn't yet — both fine.
                pass


@contextmanager
def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
