# 32 — Deploy runbook

Target stack: **Supabase** (Postgres) + **Fly.io** (Node API) + **Cloudflare Pages** (web).
One owner, a few referees, $0-ish on free tiers. Every env var below is documented
in `.env.example` — copy values from there, never commit real ones.

> **Honest "not yet" — read first.** There is no real login yet. `POST /v1/session`
> is a dev-only impersonation endpoint and is disabled whenever `DATABASE_URL` is
> set (unless you force `ACL_DEV_LOGIN=1` — don't). So on the deployed site,
> **nobody can sign in** until Battle.net/Discord OAuth lands. Public reads
> (leaderboards, matches, events) work fine; account actions do not. Also not
> yet: custom SMTP, a restore drill, real device pairing in production.

## 1. Supabase — database

1. supabase.com → New project → pick a region, save the DB password.
2. Get the **connection pooler** string: Dashboard → Connect →
   "Transaction pooler" (port **6543**). It looks like
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
   This is your `DATABASE_URL`. Leave `PGSSL` unset (pooler requires TLS;
   the driver already uses `rejectUnauthorized:false`).
3. Apply migrations. Install the Supabase CLI, then:
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # applies supabase/migrations/*.sql in order
   ```
   `supabase/seed.sql` is **dev-only** — do not run it against production.
4. Find your owner account id (used for `ACL_ADMIN_ACCOUNTS` later):
   the `accounts` table, or create one via the pairing flow once the API is up.

## 2. Fly.io — API

1. `brew install flyctl` (or fly.io/docs hands-on install), `fly auth signup`.
2. From the repo root — `fly.toml` already exists:
   ```bash
   fly launch --no-deploy        # adopt the existing config; rename app if taken
   fly secrets set \
     DATABASE_URL="postgres://...pooler.supabase.com:6543/postgres" \
     ACL_WEB_ORIGIN="https://<your-pages-domain>" \
     ACL_ADMIN_ACCOUNTS="<owner account uuid>"
   fly deploy
   ```
   `fly.toml` already sets `ACL_SEED=0`, `ACL_TRUST_PROXY=1` (Fly sets
   `x-forwarded-for` — needed for rate limiting), `ACL_PORT=8080`, and a
   `/v1/status` health check. `DATABASE_URL` switches the API to Postgres mode
   automatically; it never seeds and runs one rating generation at boot.
3. Verify: `curl https://acl-api.fly.dev/v1/status` → `200`, `ratingGeneration`
   non-null once reports exist.
4. CI deploys: `fly tokens create deploy` → add the token as repo secret
   `FLY_API_TOKEN` (GitHub → Settings → Secrets → Actions). Then
   `.github/workflows/deploy-api.yml` redeploys on pushes to `main` that touch
   `packages/**` or `fly.toml`.

## 3. Cloudflare Pages — web

Pages connects to the GitHub repo directly (no workflow needed).

- Build command: `pnpm install --frozen-lockfile && pnpm -C apps/web build`
- Output directory: `apps/web/dist`
- Root directory: `/`
- Environment variables: `VITE_API_URL=https://acl-api.fly.dev`,
  `NODE_VERSION=20`, `PNPM_VERSION=9.15.9`

`apps/web/public/_headers` ships CSP/security headers and `_redirects`
(`/* /index.html 200`) ships SPA routing — both land in `dist/` automatically.
Then attach your custom domain in the Pages dashboard, and set
`ACL_WEB_ORIGIN` on Fly to that domain so CORS allows it.

## 4. GitHub repo checklist

- Settings → Branches → protect `main`: require `ci / check` and
  `ci / postgres` green; require PRs.
- Settings → Security: enable private vulnerability reporting,
  Dependabot alerts + security updates, secret scanning + push protection.
- Settings → Actions → default workflow permissions: read-only.
- Secrets needed in Actions: `FLY_API_TOKEN` (deploy job only).

## 5. Five-minute owner ops

| Task | How |
| --- | --- |
| Pause rating | No flag yet — revoke upload devices (below) or `fly scale count 0` stops intake entirely |
| Regenerate ratings | `curl -X POST https://acl-api.fly.dev/v1/admin/regenerate -H "authorization: Bearer <admin session>"` — caller must be in `ACL_ADMIN_ACCOUNTS`; 5/min rate limit |
| Revoke a device | DB: `update installations set revoked_at = now() where id = '<installation uuid>'` |
| Inspect | `fly logs` (API), Supabase dashboard → Table Editor (evidence is immutable — inspect, don't edit) |
| Check freshness | `/v1/status` → `ratingGeneration.computedAtMs`; the site shows "generation N ago" |

## 6. Not yet (known gaps)

- **Real login** — dev session endpoint is off in prod by design; OAuth (Battle.net/Discord) is the next milestone.
- **Custom SMTP** — Supabase's default mailer only reaches team addresses.
- **Restore drill** — docs/17 requires one successful restore before public ranking.
- **Pause-rating flag** — currently done by revoking devices or scaling the app.
