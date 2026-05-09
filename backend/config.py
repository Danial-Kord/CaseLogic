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


def load_settings() -> Settings:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    database_url = os.environ.get("DATABASE_URL", f"sqlite:///{REPO_ROOT / 'app.db'}")
    vector_index_path = os.environ.get("VECTOR_INDEX_PATH", str(DATA_DIR / "index"))
    return Settings(
        anthropic_api_key=api_key,
        database_url=database_url,
        vector_index_path=vector_index_path,
    )
