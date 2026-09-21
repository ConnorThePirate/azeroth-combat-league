# 32 — Deploy runbook

Target stack: **Supabase** (Postgres) + **Fly.io** (Node API) + **Cloudflare Pages** (web).
One owner, a few referees, $0-ish on free tiers. Every env var below is documented
in `.env.example` — copy values from there, never commit real ones.

> **Honest "not yet" — read first.** Sign-in is **Supabase Auth** — email +
> password plus whatever OAuth providers you switch on in the dashboard.
> `POST /v1/session` remains a dev-only impersonation endpoint and is
> disabled whenever `DATABASE_URL` is set (unless you force
> `ACL_DEV_LOGIN=1` — don't). The API validates each website bearer token
> against `${SUPABASE_URL}/auth/v1/user` and auto-provisions a
> profile + account on first sign-in (`accounts.auth_user_id`, migration
> 0012). Still not real yet: Battle.net *character* claiming (account login
> is not character identity), custom SMTP, a restore drill.

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
   Migration `0013_bootstrap.sql` carries the operational config a live DB
   needs (client build, honest feature flags, cap-60 bracket, Forever pool,
   elo policy, live Season 1, Standard + community rulesets) and applies with
   the rest — no manual data step. Its season id matches the server's
   `ACL_SEASON` default, so nothing else needs configuring.
4. **Auth** (Dashboard → Authentication):
   - Settings → API: copy the **project URL** (`SUPABASE_URL` /
     `VITE_SUPABASE_URL`) and the **anon public key** (`SUPABASE_ANON_KEY` /
     `VITE_SUPABASE_ANON_KEY`). The anon key is safe to ship in the web
     bundle — it's a rate-limited credential, not a secret.
   - Providers: Email is on by default — for beta you may keep
     **Confirm email** on or switch it off (Authentication → Providers →
     Email). Enable **Discord** and/or **Google** there too; each needs its
     own OAuth app credentials — that's dashboard config, not code.
   - Authentication → URL Configuration: set Site URL to the site origin
     and add `https://<your-pages-domain>/account` (and
     `http://localhost:5173/account` for local dev) to Redirect URLs —
     OAuth buttons redirect back there.
5. Find your owner account id (used for `ACL_ADMIN_ACCOUNTS` later): after
   you sign in once on the deployed site, `select id from accounts` (the API
   auto-provisions the row on first sign-in).

## 2. Fly.io — API

1. `brew install flyctl` (or fly.io/docs hands-on install), `fly auth signup`.
2. From the repo root — `fly.toml` already exists:
   ```bash
   fly launch --no-deploy        # adopt the existing config; rename app if taken
   fly secrets set \
     DATABASE_URL="postgres://...pooler.supabase.com:6543/postgres" \
     SUPABASE_URL="https://<ref>.supabase.co" \
     SUPABASE_ANON_KEY="<anon public key>" \
     ACL_WEB_ORIGIN="https://<your-pages-domain>" \
     ACL_ADMIN_ACCOUNTS="<owner account uuid>"
   fly deploy
   ```
   `fly.toml` already sets `ACL_SEED=0`, `ACL_TRUST_PROXY=1` (Fly sets
   `x-forwarded-for` — needed for rate limiting), `ACL_PORT=8080`, and a
   `/v1/status` health check. `DATABASE_URL` switches the API to Postgres mode
   automatically; it never seeds and runs one rating generation at boot.
   Without the `SUPABASE_*` pair the API logs a startup warning and every
   session-gated route returns 401 — public reads still work.
   No identity-scope env needed — WoW Forever is one PvP megaserver, so
   `POST /v1/characters` registers into fixed constants
   (`wow-forever`/`live`/`global`/`forever`, see `IDENTITY_SCOPE` in
   `packages/server/src/serve.ts`).
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
  `VITE_SUPABASE_URL=https://<ref>.supabase.co`,
  `VITE_SUPABASE_ANON_KEY=<anon public key>`,
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

- **Battle.net character claim** — account sign-in is live (Supabase Auth),
  but linking a WoW character to it still needs the provider flow (docs/26);
  until then characters attach via pairing + event check-ins.
- **Custom SMTP** — Supabase's default mailer only reaches team addresses;
  for beta, either keep email confirmation off or accept the limit.
- **Restore drill** — docs/17 requires one successful restore before public ranking.
- **Pause-rating flag** — currently done by revoking devices or scaling the app.
