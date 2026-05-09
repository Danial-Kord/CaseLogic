"""Profile endpoints — single-row 'who's using the app' demo singleton.

The profile feeds two surfaces:
- The sidebar avatar/name in the frontend.
- The chat system prompt: `backend/chat/service.py` reads the row and
  prepends "you're talking to X" context so the LLM tailors tone/depth.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from backend.api.schemas import ProfileOut, ProfileUpdate
from backend.db import get_session
from backend.models import Profile

router = APIRouter(tags=["profile"])


def _get_or_create(session) -> Profile:
    profile = session.scalar(select(Profile).limit(1))
    if profile is None:
        profile = Profile()
        session.add(profile)
        session.flush()
    return profile


def _to_out(p: Profile) -> ProfileOut:
    return ProfileOut(
        name=p.name,
        role=p.role,
        firm=p.firm,
        about=p.about,
        updated_at=p.updated_at,
    )


@router.get("/profile", response_model=ProfileOut)
def get_profile() -> ProfileOut:
    with get_session() as session:
        return _to_out(_get_or_create(session))


@router.put("/profile", response_model=ProfileOut)
def update_profile(payload: ProfileUpdate) -> ProfileOut:
    with get_session() as session:
        profile = _get_or_create(session)
        profile.name = payload.name
        profile.role = payload.role
        profile.firm = payload.firm
        profile.about = payload.about
        session.flush()
        return _to_out(profile)
