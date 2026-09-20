-- 0006: integrity + operations (docs/14,16,18).

create table disputes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  filed_by uuid not null references profiles(id),
  kind text not null check (kind in ('outcome_conflict','violation','interference','missing_peer','other')),
  detail text not null,
  status text not null default 'open' check (status in ('open','claimed','decided','dismissed')),
  created_at timestamptz not null default now()
);

create table evidence_attachments (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references disputes(id) on delete cascade,
  match_id uuid references matches(id),
  object_ref text not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references disputes(id),
  actor_id uuid not null references profiles(id),
  action text not null check (action in ('uphold','correct','void','game_loss','dq','restrict','ban','bracket_repair','dismiss')),
  reason text not null,
  created_at timestamptz not null default now()
);

create table sanctions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  kind text not null check (kind in ('ranked_restriction','suspension','ban')),
  reason_category text not null,
  detail text not null default '',
  issued_by uuid references profiles(id),
  effective_at timestamptz not null,
  expires_at timestamptz,
  reviewed boolean not null default false,      -- second review when staff exist
  created_at timestamptz not null default now()
);

create table appeals (
  id uuid primary key default gen_random_uuid(),
  sanction_id uuid references sanctions(id),
  dispute_id uuid references disputes(id),
  filed_by uuid not null references profiles(id),
  body text not null,
  status text not null default 'open' check (status in ('open','upheld','overturned')),
  created_at timestamptz not null default now()
);

create table audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Idempotency: actor+route+key unique; same body replays stored response,
-- different digest is a 409 conflict (docs/13,15).
create table idempotency_records (
  actor_id uuid not null,
  route text not null,
  key text not null,
  request_digest text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, route, key)
);

-- Postgres job queue: SKIP LOCKED claim, lease recovery, bounded retries.
create type job_state as enum ('pending','claimed','done','failed','dead');

create table jobs (
  id bigint generated always as identity primary key,
  type text not null check (type in
    ('reconcile','replay_season','projection_publish','reminders','bracket_maintenance','expiry','retention')),
  state job_state not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  lease_until timestamptz,
  cursor jsonb,                                 -- checkpoint across invocations
  idempotency_key text not null unique,
  dead_reason text,
  created_at timestamptz not null default now()
);

create index jobs_claimable on jobs(state, available_at) where state = 'pending';
create index jobs_leases on jobs(lease_until) where state = 'claimed';
