# Engineering setup

## Stack
pnpm workspaces; pinned current Node LTS; React/TypeScript/Vite; router, query cache and schema validator chosen consistently.
Supabase CLI/local Docker database, SQL migrations/RLS tests.
Lua client-compatible syntax, explicit Blizzard adapters, Luacheck/StyLua or verified equivalents.
Vitest for TypeScript, Playwright for core web flows, Lua fixture runner.
Optional helper chosen after file-watch spike; no desktop framework required to begin web/addon.
Do not assume Battle.net is a native Supabase Auth provider.

## Commands the agent implements
dev, build, lint, typecheck, test, test:e2e, db:reset, db:test, addon:test, addon:package.
Reference already runnable: node --test reference/rating.test.mjs.
Shared JSON Schemas v2 generate TS types/validators and Lua valid/invalid fixtures.

## Package boundaries
contracts imports no app; rating is pure deterministic logic; web has no authoritative rank mutation.
Backend validates independently. Addon receives only public config/identity, never server/provider secrets.
Helper parser has bounded input and executes no Lua.
Do not ship reference tests/probe logs in addon ZIP.

## Environment
Public: SUPABASE URL/publishable or anon key, site URL.
Server only: service key, DB migration credentials, Battle.net client ID/secret/callback configuration, provider-token encryption secret where retention is needed.
Helper: per-device revocable upload-only token in OS store.
CI backup credentials isolated from web build.
Commit example placeholders, never values.

## Quality
Lock dependency/runtime versions, secret scan, core auth/RLS tests, deterministic protocol fixtures and rating tests.
Build release addon ZIP with correct .toc and changelog.
Render minimal useful UI; accessibility/mobile checks.
Routine docs/UI changes need focused tests, not a full client lab run.

## Artifacts
Web build, addon ZIP/checksum, migrations/config manifest, optional helper build/hash, source capability record.
Owner-friendly setup guide must state developer app registration and real client tests that code alone cannot perform.
