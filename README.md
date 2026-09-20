# Azeroth Combat League

A free, volunteer-run PvP community platform for **WoW Forever**. Walk up to
anyone, agree on rules, duel — the addon records it, both clients corroborate
it, and it counts. Leaderboards, rivalries, fight nights, and community-built
rulesets, with no paid rank, no honor-system score entry, and no mandatory
queue.

[![CI](https://github.com/ConnorThePirate/azeroth-combat-league/actions/workflows/ci.yml/badge.svg)](https://github.com/ConnorThePirate/azeroth-combat-league/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-eda63f.svg)](LICENSE)

> **Status: pre-beta.** The website and API run end-to-end against seeded
> data. The addon is built against retail-style APIs and is being validated on
> the Forever client in a two-developer beta lab (docs/30) before any capability
> is advertised. See the live [status page](apps/web/src/pages/Status.tsx) for
> what's proven.

## How it works

1. **Challenge in game.** Target someone, pick a ruleset (Standard or a
   community set), send the challenge. The addon writes a *match contract*
   both sides accept.
2. **Duel under the contract.** Both clients record independently: games,
   winners, rule violations from the combat log. Custom rules never touch the
   Standard rating.
3. **Results count.** Each client's report reaches the server through the
   companion. Two independent reports that agree = a corroborated result.
   Ratings replay deterministically from the immutable evidence log — no
   typed scores, no one-party claims.

Identity verification happens **at events**: organizer-designated referees can
check a character in. Regular duels don't need a witness — they're
corroborated by both participants' clients.

## Repository

| Path | What |
|---|---|
| `apps/addon` | Lua addon: contracts, rulesets, duel recorder, peer comms, sync badge, hub UI |
| `apps/web` | React + TypeScript + Vite site: leaderboards, matches, players, events, rules builder |
| `apps/uploader` | Companion (`acl-companion`): watches SavedVariables, uploads reports, stages receipts back, lives and dies with the game |
| `packages/server` | Node HTTP API: ingest, corroboration, rating generations, events, pairing. In-memory store for dev, Postgres for production |
| `packages/rating` | Community Elo v1 — deterministic, replayable |
| `packages/contracts` | Versioned wire schemas + cross-language fixtures |
| `supabase` | Postgres migrations, RLS, trusted functions, seed |
| `docs` | Design docs; `docs/00_DOCS_INDEX.md` is the map |
| `reference` | Pure rating reference implementation and tests |

## Quick start (local)

```sh
pnpm install
pnpm -C packages/server dev     # API on :8787 with a seeded, deterministic season
pnpm -C apps/web dev            # site on :5173 (set VITE_API_URL=http://localhost:8787)
pnpm test                       # all TypeScript packages
pnpm addon:test                 # Lua addon test suite
```

The dev API seeds ten fighters and ~56 corroborated series through the real
ingest path, so the leaderboard, match pages, and player popups are populated.
`ACL_SEED=0` starts empty. Without `VITE_API_URL` the site runs on fixtures.

**Addon:** copy `apps/addon/AzerothCombatLeague` into `Interface/AddOns`.
Practice duels work immediately with no account.

**Companion:** `acl-companion setup <wow dir>` → `pair` → `install --autostart`.
Once. After that the companion starts when WoW does and exits with it.

## Authentication

Production sign-in runs on **Supabase Auth**: email + password plus OAuth
providers (Discord, Google) enabled in the Supabase dashboard — that part is
dashboard config, not code. The site (`VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY`) sends the session access token as a bearer token;
the API (`SUPABASE_URL` + `SUPABASE_ANON_KEY`) validates it against
`/auth/v1/user` and auto-provisions a profile + account on first sign-in
(`accounts.auth_user_id`, migration 0012). For beta, the email-confirmation
toggle in the Supabase dashboard controls whether sign-up needs an inbox
round-trip. Local dev keeps the labelled development sign-in
(`POST /v1/session`), which is disabled whenever `DATABASE_URL` is set.

## Deploying

Beta infrastructure is deliberately cheap: static site on **Cloudflare Pages**,
API as a small **Fly.io** machine, **Supabase** Postgres. See
[`docs/32_DEPLOY_RUNBOOK.md`](docs/32_DEPLOY_RUNBOOK.md) for the step-by-step
and [`.env.example`](.env.example) for every configuration variable.

## Invariants we don't break

- No unsupported one-party claim changes rank. Two independent attestations or
  an evidence-backed, scoped referee decision.
- Evidence and decisions are immutable; effects are idempotent; rating replay
  is deterministic.
- The addon never contains tokens, passwords, or service keys — and never
  automates gameplay, reads memory, injects input, or reconstructs hidden data.
- Custom rulesets cannot silently affect Standard rating.
- Unsynced evidence is never silently deleted.
- Capabilities are advertised only after they're measured on the real client.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md), then [`AGENTS.md`](AGENTS.md) for
the engineering rules and canonical design docs. Good first areas: rulesets,
web polish, addon UI, event templates. Security issues: see
[`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE). World of Warcraft is a trademark of Blizzard Entertainment;
this is an unaffiliated community project and contains no Blizzard assets.
