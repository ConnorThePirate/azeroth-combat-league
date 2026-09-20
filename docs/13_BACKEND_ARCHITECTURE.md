# Backend architecture

Modular application, managed Postgres and small trusted functions. No microservices required.

## Components
Static web; Supabase app Auth; server-side Battle.net connection; ingestion/reconciliation; rating generation jobs; rules catalog; tournament service; community events; moderation.
Optional desktop helper uses upload-only endpoint. Lua has no arbitrary HTTPS route.

## Reads/writes
Public read models via RLS-safe views. Private user data owner-only.
All identity, adjudication, rating, bracket, sanction and rules-publication mutations through scoped functions.
No service role in browser/addon.
Server roles and object storage privacy are independent of whether Cloudflare serves the website.

## Transaction design
Do not implement rating via several unrelated REST calls.
Small trusted Postgres RPC commits one generation/chunk/ledger batch with constraints, revision check and locks; or a server connection executes an explicit transaction.
TS rating computation is deterministic pure logic; commit compares source revision/preconditions and retries stale work.
Replays write inactive generation then atomically publish pointer. No partial public generation.
Security-definer RPC fixes search_path, explicitly validates actor/scope and revokes public execution.

## Jobs
Postgres jobs with type, state, available_at, attempt_count, lease_until, cursor, idempotency key.
Claim with SKIP LOCKED; recover expired leases, bounded retries, dead-letter reason.
Jobs: reconcile, replay season, projection publish, reminders, bracket maintenance, expiry, retention.
Checkpoint replays across function invocations. Provider CPU/time limits prohibit assuming an entire growing season fits one request.

## Idempotency
Actor+route+key unique; same body returns original response, different digest -> 409.
Ingestion additionally enforces unique origin nonce and immutable session identity.
Exactly-once effects are achieved by constraints/transactions, not by promising exactly-once transport.

## Freshness
Leaderboard latest completed generation displayed with time.
Addon config/rating snapshots show imported_at and expiry.
Browser event progress may poll when visible; no all-users permanent realtime subscription.
Live server kill switch pauses server writes, not offline clients.

## Budget
Keep decisive facts and bounded match summaries in Postgres; private compressed evidence objects only when useful.
No full unlimited combat-log stream retained. Cache public results; paginate.
