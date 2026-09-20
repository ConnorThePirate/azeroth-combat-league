# Low-cost community infrastructure

## Recommended
React/TypeScript/Vite static web on Cloudflare Pages.
Supabase Postgres/Auth/Storage/Edge Functions; server-side Battle.net connection adapter.
GitHub repository/CI/releases, subject to actual account limits.
No Redis, microservice mesh, always-on AI API, paid analytics or native companion hosting server.

## Budget
Closed beta can be $0/month plus optional domain, within quotas.
First useful paid upgrade: managed DB reliability/backups, around $25/month at checked Supabase pricing; evaluate actual plan then.
Optional email delivery/domain/code-signing/distribution may add cost. Do not promise zero-cost polished signed desktop distribution.
No automatic paid provisioning in coding tasks.

## Checked limits
Supabase pricing checked 2026-09-19: Free 500 MB DB, 1 GB storage, 50k MAU, 5 GB egress, two active projects, inactivity pausing after one week; Pro starts $25/month. https://supabase.com/pricing
Cloudflare Pages static hosting suitable for beta; check builds/assets limits before launch. https://developers.cloudflare.com/pages/platform/limits/
Supabase default SMTP is limited to authorized team addresses and unsuitable for community onboarding; configure custom SMTP or supported social login. https://supabase.com/docs/guides/auth/auth-smtp
Edge Functions have bounded CPU/duration; chunk replays/jobs. https://supabase.com/docs/guides/functions/limits
Cloudflare hosting does not automatically protect directly reachable Supabase endpoints; enforce backend limits/auth.

## Environments
Local Supabase + fixtures; one hosted beta; second free project optional staging.
No per-PR production identities. Preview frontend uses scrubbed/local/shared staging data.
Versioned migrations and config. Pin compatible dependencies in lockfile, not invented prose versions.

## Deploy
Focused lint/test/typecheck -> migrations/RLS -> web build -> addon ZIP -> preview -> explicit release.
Test client build for addon-affecting releases. Pure website copy fixes need not wait for WoW access.
Cache public leaderboards and poll event pages only while visible. Avoid thousands of idle realtime subscriptions.

## Backups/operations
Free beta: explicit logical DB export to a separate encrypted location, credentials only in CI; private storage objects need separate backup plan.
One successful restore drill before public ranking. Managed DB backup does not imply object files are backed up.
Warn at 60/80/95% quotas; degrade nonessential evidence uploads before core match intake.
Keep tiny decisive facts in DB, bounded compressed evidence in private storage. No unlimited raw logs.
Document a five-minute owner runbook: pause rating, inspect queue, restore config, revoke device, resolve case.
