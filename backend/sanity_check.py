"""Phase 1 sanity check: Python deps import + optional Anthropic ping.

Run from repo root:

    python backend/sanity_check.py

Requires `.env` with `ANTHROPIC_API_KEY` only for the API smoke call (skipped if unset).
"""


from __future__ import annotations

import os
import sys


def _imports() -> None:
    import anthropic  # noqa: F401
    import chromadb  # noqa: F401
    import fastapi  # noqa: F401
    import httpx  # noqa: F401
    import pydantic  # noqa: F401
    import pypdf  # noqa: F401
    import sqlalchemy  # noqa: F401
    import uvicorn  # noqa: F401
    from bs4 import BeautifulSoup  # noqa: F401


def _anthropic_ping() -> None:
    from dotenv import load_dotenv

    load_dotenv()
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        print("ANTHROPIC_API_KEY not set — skipping Anthropic API smoke call.")
        return

    import anthropic

    model = os.getenv("ANTHROPIC_SANITY_MODEL", "claude-sonnet-4-20250514")
    client = anthropic.Anthropic(api_key=key)
    msg = client.messages.create(
        model=model,
        max_tokens=32,
        messages=[{"role": "user", "content": 'Reply with exactly one word: "ok".'}],
    )
    parts = [b.text for b in msg.content if getattr(b, "text", None)]
    text = "".join(parts)
    clipped = text.strip()
    if len(clipped) > 120:
        clipped = clipped[:120] + "..."
    print(f"Anthropic OK ({model}): {clipped}")


def main() -> int:
    print("Checking Python imports from requirements.txt …")
    try:
        _imports()
    except ImportError as e:
        print(f"IMPORT FAILED: {e}", file=sys.stderr)
        print("Run: pip install -r requirements.txt", file=sys.stderr)
        return 1
    print("All imports OK.")

    try:
        _anthropic_ping()
    except Exception as e:
        print(f"Anthropic smoke call failed: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
