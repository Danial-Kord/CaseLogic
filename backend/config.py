"""Runtime configuration loaded from environment variables (and .env if present)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"


def _load_dotenv_if_present() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)


_load_dotenv_if_present()


DEFAULT_FIRECRAWL_ALLOWED_DOMAINS: tuple[str, ...] = (
    "leginfo.legislature.ca.gov",
    "courtlistener.com",
    "scholar.google.com",
    "*.gov",
    "*.edu",
)
"""Authoritative legal sources the chat agent's web_search tool will accept.

`*.tld` patterns match any subdomain; bare hosts match an exact host.
Override at runtime via `FIRECRAWL_ALLOWED_DOMAINS` (comma-separated).
"""


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str
    database_url: str
    vector_index_path: str
    # Claude model used for the web_search tool. Sonnet is fast + cheap and the
    # tool support is identical to Opus for our use case.
    web_search_model: str = "claude-sonnet-4-6"
    # Hard cap on search tool invocations per /ingest/search request.
    web_search_max_uses: int = 5
    # Polite scraping defaults — applied to the raw URL fetcher.
    fetch_user_agent: str = "CaseLogic/0.1 (hackathon prototype; +https://example.invalid)"
    fetch_timeout_seconds: float = 20.0
    # Chat agent settings -----------------------------------------------------
    # Same Sonnet model by default; overridable via CHAT_MODEL.
    chat_model: str = "claude-sonnet-4-6"
    # Hard cap on stored chat history that gets replayed into Claude per turn.
    # Keeps context cost bounded; older turns get trimmed oldest-first.
    chat_history_cap: int = 30
    # Safety bound on the inner tool-use loop. Each agent turn calls Claude at
    # most this many times before we force a final response.
    chat_max_steps: int = 6
    firecrawl_api_key: str = ""
    firecrawl_allowed_domains: tuple[str, ...] = DEFAULT_FIRECRAWL_ALLOWED_DOMAINS


def _parse_allowed_domains(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return DEFAULT_FIRECRAWL_ALLOWED_DOMAINS
    parts = [p.strip().lower() for p in raw.split(",") if p.strip()]
    return tuple(parts) or DEFAULT_FIRECRAWL_ALLOWED_DOMAINS


def load_settings() -> Settings:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    database_url = os.environ.get("DATABASE_URL", f"sqlite:///{REPO_ROOT / 'app.db'}")
    vector_index_path = os.environ.get("VECTOR_INDEX_PATH", str(DATA_DIR / "index"))
    chat_model = os.environ.get("CHAT_MODEL") or "claude-sonnet-4-6"
    chat_history_cap = int(os.environ.get("CHAT_HISTORY_CAP", "30"))
    chat_max_steps = int(os.environ.get("CHAT_MAX_STEPS", "6"))
    firecrawl_api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    firecrawl_allowed_domains = _parse_allowed_domains(
        os.environ.get("FIRECRAWL_ALLOWED_DOMAINS")
    )
    return Settings(
        anthropic_api_key=api_key,
        database_url=database_url,
        vector_index_path=vector_index_path,
        chat_model=chat_model,
        chat_history_cap=chat_history_cap,
        chat_max_steps=chat_max_steps,
        firecrawl_api_key=firecrawl_api_key,
        firecrawl_allowed_domains=firecrawl_allowed_domains,
    )
