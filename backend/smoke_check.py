"""Phase 1 sanity check: prove the deps install + the Anthropic API is reachable.

Run with:

    python -m backend.smoke_check

Reads `ANTHROPIC_API_KEY` from the environment (or a `.env` file at repo root via
python-dotenv if present). Sends one tiny `claude-haiku-4-5` request — cheapest model
that still proves the SDK + key + network path. Exits 0 on success, prints the
response text. Exits non-zero with a one-line cause on failure.

Intentionally narrow: this is *only* for kickoff "does my laptop work" smoke tests,
not a test fixture or library.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _load_dotenv_if_present() -> None:
    """Load .env from the repo root if python-dotenv is installed and the file exists."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)


def _check_imports() -> None:
    """Importing the headline deps confirms `pip install -r requirements.txt` worked."""
    import fastapi  # noqa: F401
    import sqlalchemy  # noqa: F401
    import chromadb  # noqa: F401
    import anthropic  # noqa: F401
    import pydantic  # noqa: F401


def _ping_anthropic() -> str:
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in."
        )

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=32,
        messages=[
            {
                "role": "user",
                "content": "Reply with exactly the word: pong",
            }
        ],
    )
    parts = [block.text for block in response.content if getattr(block, "type", None) == "text"]
    return "".join(parts).strip()


def main() -> int:
    _load_dotenv_if_present()
    try:
        _check_imports()
    except ImportError as exc:
        print(f"[smoke] dependency import failed: {exc}", file=sys.stderr)
        print("[smoke] run: pip install -r requirements.txt", file=sys.stderr)
        return 2

    try:
        reply = _ping_anthropic()
    except Exception as exc:
        print(f"[smoke] anthropic call failed: {exc}", file=sys.stderr)
        return 3

    print(f"[smoke] deps OK; anthropic replied: {reply!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
