"""FastAPI application entry point — initializes the DB and mounts routers."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="CaseLogic backend",
    description="Source-grounded PI legal research API.",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow any localhost / 127.0.0.1 origin on any dev port. Browsers treat
# `localhost` and `127.0.0.1` as distinct origins, and Vite/Next pick
# different ports when one is busy — pinning a single value caused dev
# preflights (OPTIONS) to 400 with "Disallowed CORS origin".
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["status"])
def healthz() -> dict:
    return {"ok": True}


# Routers are imported lazily after `app` exists so that any import-time failure
# in a route module (missing env, etc.) surfaces with the right traceback.
from backend.api import (  # noqa: E402
    routes_chat,
    routes_ingest,
    routes_statutes,
    routes_status,
)

app.include_router(routes_status.router)
app.include_router(routes_ingest.router)
app.include_router(routes_statutes.router)
app.include_router(routes_chat.router)
