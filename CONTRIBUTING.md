# Contributing to a community project

Keep changes small and understandable. Explain the player benefit, affected invariants, tests, and rollback.
Use short-lived branches, conventional commits and pinned dependencies.
Local prerequisites: Node/pnpm, Supabase CLI with Docker-compatible runtime, Lua tools; real Forever client only for affected addon probes.
No production credentials in fixtures or PRs.
Applied migrations are immutable; add forward repairs.
Rating changes require algorithm version, golden examples and replay tests.
Rules/catalog changes require test fixtures and explicit coverage.
Report security issues privately before publishing an exploit — see SECURITY.md.
No contributor must run the entire platform for a one-line copy fix.

## Tests

- `pnpm test` — workspace unit tests (server, contracts, rating, web).
- `pnpm addon:test` — addon Lua/Fengari harness.
- `pnpm -C packages/server test:pg` — Postgres integration tests; skipped unless
  `DATABASE_URL` points at a database with the migrations applied.
- `pnpm typecheck` and `pnpm build` must pass; CI (`ci / check`, `ci / postgres`)
  must be green before merge.
