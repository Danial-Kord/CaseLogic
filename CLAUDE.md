# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project context

This is the team's prep repo for the **EvenUp x OpenClaw Hackathon** — a 24-hour build where a small team replicates a meaningful slice of personal-injury legal research tooling. Public-source legal research, source-grounded answers, no fabrication.

- Brief: see [openclaw_hackathon_baseline_architecture.md](openclaw_hackathon_baseline_architecture.md)
- Project state: pre-kickoff scaffolding. No business logic implemented yet.
- The **eval set is held out** until kickoff. Do not pre-optimize on imagined judge queries.
- Depth beats breadth in scoring. Ambition is rewarded, but sprawl is penalized — pick one jurisdiction, one source type, one workflow.

## Architecture is fixed (mostly)

[openclaw_hackathon_baseline_architecture.md](openclaw_hackathon_baseline_architecture.md) is the source of truth for module boundaries, suggested interfaces, table schemas, and API contracts. **Do not invent new top-level modules** without first checking that doc — directory layout was deliberately mirrored from Section 5.

When asked to implement a module, look up the suggested interface in that doc (Section 3 has per-module interfaces, Section 6 has API contracts) and follow it unless the user says otherwise.

## Hard constraints (judges will check these)

1. **Every factual claim must trace to a real public source.** No fabrication, no hardcoded answers, no model-memory facts.
2. **Source URL + paragraph/snippet attached to every important claim.** This is non-negotiable — it's Failure Mode 2 in the baseline doc.
3. **Retrieval before answering** for any factual question. The reasoning layer summarizes evidence; it does not invent it.
4. **Unsupported claims get flagged, not hidden.** Verification layer marks them `unsupported` rather than removing silently.
5. **Not legal advice.** Always include the disclaimer in user-facing surfaces.

## Conventions

- **Pre-kickoff stubs**: every Python module currently has a one-line `"""docstring"""` and nothing else. Frontend `.tsx` files have a one-line comment + a component returning `null`. Don't flesh these out until the user explicitly says "implement X" — premature implementation locks in design choices we don't have yet.
- **Source tracking is mandatory in every layer.** Document IDs, chunk IDs, and extraction outputs all carry their source URL. Don't drop this metadata when refactoring.
- **Hybrid retrieval, not pure vector.** Legal queries depend on exact phrases, statutes, jurisdictions — keyword + metadata filters matter. Failure Mode 4.
- **No new top-level dirs** without asking. The team agreed on the structure in Section 5.

## Stack defaults (overridable)

- Backend: FastAPI + SQLAlchemy + SQLite (local hackathon DB)
- LLM: Anthropic Claude (API key via `ANTHROPIC_API_KEY`)
- Vector: Chroma (LanceDB acceptable; Postgres+pgvector only if someone owns it)
- Frontend: TBD — placeholder TSX files only; team picks Vite/Next at kickoff
- Embeddings: TBD — pick at kickoff based on what's available

If a request implies a different stack choice, surface the deviation rather than silently switching.

## Failure modes to actively avoid

From Section 15 of the baseline doc:

1. **Generic chatbot** — answers from model memory. Force retrieval; show snippets.
2. **No traceability** — answer reads well but judges can't verify. Attach URL + paragraph to every claim.
3. **Too broad** — covers all of law. Pick one jurisdiction + one domain + one source.
4. **Bad search** — pure vector misses exact phrases. Add keyword + metadata filters.
5. **Overbuilt UI, weak pipeline** — pretty app, broken retrieval. Build source tracking, search, verification *first*.

## Repo orientation

- `backend/` — FastAPI app, all logic. See [README.md](README.md) for the per-subdirectory map.
- `openclaw/` — agent prompt + tool declarations for the OpenClaw chat layer.
- `frontend/` — placeholder UI files; toolchain not yet initialized.
- `data/raw/`, `data/processed/`, `data/index/`, `data/exports/` — all `.gitkeep` for now.
- `docs/architecture.md` — for *delta notes* during the hackathon (the full spec stays in the baseline doc at the repo root).
- `.claude/worktrees/` — disposable agent worktrees. Safe to ignore or remove.

## Working style for this repo

- This is hackathon code. Bias toward shipping a working slice over architectural purity.
- Don't add abstractions for hypothetical second use cases. The team will pick exactly one variant.
- Don't add error handling for scenarios that can't happen during a 24-hour demo.
- When in doubt, follow the baseline doc; if it conflicts with a user instruction, the user wins — but flag the deviation.
