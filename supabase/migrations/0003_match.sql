-- 0003: match contracts, reports, evidence, adjudication (docs/14).

create type lifecycle_state as enum
  ('proposed','accepted','ready','armed','active','finished','declined','cancelled','expired','interrupted','void');
create type evidence_state as enum
  ('awaiting','peer_supported','corroborated','disputed','invalid');
create type rating_state as enum
  ('ineligible','pending','applied','held','superseded');

create table match_contracts (
  id uuid primary key,                          -- session UUID
  contract_hash text not null,                  -- sha256 of canonical bytes
  canonical jsonb not null,
  season_id uuid not null references seasons(id),
  pool_id uuid not null references competition_pools(id),
  ruleset_version_id uuid not null references ruleset_versions(id),
  rated_intent boolean not null,
  ladder text check (ladder in ('open','mirror')),
  best_of int not null check (best_of in (1,3,5)),
  level_min int not null,
  level_max int not null,
  accepted_expiry timestamptz not null,
  created_at timestamptz not null default now(),
  check (rated_intent = false or ladder is not null)
);

create table match_participants (
  match_id uuid not null references match_contracts(id),
  character_id uuid not null references characters(id),
  account_id_at_match uuid not null references accounts(id),
  side int not null check (side in (1,2)),
  primary key (match_id, character_id),
  unique (match_id, side)
);

create table match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references match_contracts(id),
  origin_character_id uuid not null references characters(id),
  origin_account_id uuid not null references accounts(id),
  installation_id uuid not null references installations(id),
  nonce text not null,
  body_digest text not null,                    -- sha256 of canonical report
  body jsonb not null,
  auth_method text not null check (auth_method in ('app_session','helper','peer_signature')),
  received_at timestamptz not null default now(),
  receipt_seq bigint,
  unique (origin_account_id, installation_id, nonce)  -- nonce reuse rejects on conflict
);

-- Conflicting digest for an existing nonce is a rejection, handled in code.

create table match_report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references match_reports(id),
  supersedes_id uuid references match_report_revisions(id),
  body jsonb not null,
  body_digest text not null,
  created_at timestamptz not null default now()
);

create table report_evidence (
  report_id uuid primary key references match_reports(id),
  facts jsonb not null default '[]'::jsonb,
  coverage jsonb not null default '[]'::jsonb,
  private_object_ref text
);

create table matches (
  id uuid primary key references match_contracts(id),
  lifecycle lifecycle_state not null default 'proposed',
  evidence evidence_state not null default 'awaiting',
  rating rating_state not null default 'ineligible',
  first_seen_at timestamptz,                    -- first valid server receipt
  receipt_seq bigint unique,                    -- monotonic order at first receipt
  finished_at timestamptz,
  current_decision_id uuid
);

create sequence matches_receipt_seq;

create table match_games (
  match_id uuid not null references matches(id),
  game_index int not null,
  winner_character_id uuid references characters(id),
  finish_reason text,
  coverage jsonb not null default '{}'::jsonb,
  primary key (match_id, game_index)
);

create table adjudications (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  result text not null,                         -- uphold|correct|void|game_loss|dq
  reason text not null,
  actor_id uuid references profiles(id),
  evidence_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  supersedes_id uuid references adjudications(id)  -- append-only
);

alter table matches
  add constraint matches_current_decision_fk
  foreign key (current_decision_id) references adjudications(id);

create index match_reports_match on match_reports(match_id);
create index matches_evidence on matches(evidence) where evidence = 'awaiting';
create index matches_first_seen on matches(first_seen_at, receipt_seq);
