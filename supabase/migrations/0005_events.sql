-- 0005: events, community and world/PvP tables (docs/10,11,14).

create type event_status as enum
  ('draft','published','registration','check_in','seeded','active','review','complete','cancelled');
create type event_visibility as enum ('public','unlisted','private');

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references profiles(id),
  name text not null,
  description text not null default '',
  visibility event_visibility not null default 'public',
  region text not null default '',
  realm text not null default '',
  level_bracket_id uuid references level_brackets(id),
  class_restriction text,
  format text not null default 'single_elimination'
    check (format in ('single_elimination','round_robin','double_elimination','swiss')),
  ruleset_version_id uuid references ruleset_versions(id),
  sanctioned boolean not null default false,    -- trusted badge is separate
  status event_status not null default 'draft',
  check_in_opens_at timestamptz,
  starts_at timestamptz,
  dispute_window interval not null default '7 days',
  best_of_early int not null default 1 check (best_of_early in (1,3,5)),
  best_of_final int not null default 3 check (best_of_final in (1,3,5)),
  lock_version int not null default 1,
  created_at timestamptz not null default now()
);

create table event_staff (
  event_id uuid not null references tournaments(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  role text not null check (role in ('organizer','referee')),
  primary key (event_id, profile_id, role)
);

-- Private events are enforced by membership ACL, not unguessable URLs.
create table event_members (
  event_id uuid not null references tournaments(id) on delete cascade,
  account_id uuid not null references accounts(id),
  invited_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (event_id, account_id)
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tournaments(id),
  character_id uuid not null references characters(id),
  account_id uuid not null references accounts(id),
  status text not null default 'registered' check (status in ('registered','checked_in','dropped','disqualified')),
  seed int,
  created_at timestamptz not null default now(),
  unique (event_id, character_id),
  unique (event_id, account_id)                -- one player per linked account
);

create table entrant_members (
  registration_id uuid not null references registrations(id) on delete cascade,
  character_id uuid not null references characters(id),
  primary key (registration_id, character_id)
);

create table check_ins (
  registration_id uuid primary key references registrations(id),
  checked_in_at timestamptz not null default now()
);

create table bracket_nodes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references tournaments(id),
  round int not null,
  position int not null,
  registration_a uuid references registrations(id),
  registration_b uuid references registrations(id),
  winner_registration_id uuid references registrations(id),
  match_id uuid references matches(id),
  seed_identity jsonb not null default '{}'::jsonb,  -- immutable seed record
  lock_version int not null default 1,
  unique (event_id, round, position)
);

create table event_matches (
  event_id uuid not null references tournaments(id),
  match_id uuid not null references matches(id),
  bracket_node_id uuid references bracket_nodes(id),
  primary key (event_id, match_id)
);

create table rules_acceptances (
  id uuid primary key default gen_random_uuid(),
  ruleset_version_id uuid not null references ruleset_versions(id),
  account_id uuid not null references accounts(id),
  context text not null,                        -- 'duel'|'event:<id>'
  accepted_at timestamptz not null default now(),
  unique (ruleset_version_id, account_id, context)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references tournaments(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- World / Pit (docs/10): opt-in journals first, scores gated on probes.
create table world_opt_ins (
  account_id uuid primary key references accounts(id),
  consent_version text not null,
  opted_in_at timestamptz not null default now(),
  opted_out_at timestamptz
);

create table world_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  character_id uuid not null references characters(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table kill_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references world_sessions(id),
  reporter_character_id uuid not null references characters(id),
  victim_character_id uuid references characters(id),
  victim_display text,
  victim_level int,
  domain text not null check (domain in ('war','pit')),
  zone text not null,
  observed_at timestamptz,
  received_at timestamptz not null default now(),
  body jsonb not null,
  unique (session_id, victim_character_id, observed_at)
);

create table kill_decisions (
  id uuid primary key default gen_random_uuid(),
  kill_report_id uuid not null references kill_reports(id),
  status text not null check (status in ('corroborated','attested','rejected','unknown')),
  reason text not null default '',
  decided_at timestamptz not null default now()
);

-- One kill source can never score in two domains (docs/14).
create table score_ledger (
  id bigint generated always as identity primary key,
  season_id uuid not null references seasons(id),
  account_id uuid not null references accounts(id),
  domain text not null check (domain in ('war','pit')),
  score_source_id uuid not null,                -- kill_report or event id
  points int not null,
  created_at timestamptz not null default now(),
  unique (domain, score_source_id)
);

create table pit_lives (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references world_sessions(id),
  character_id uuid not null references characters(id),
  armed_at timestamptz not null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('death','exit','logout','incomplete')),
  heat int not null default 0 check (heat between 0 and 5),
  eligible boolean not null default true
);

create table horns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  zone text not null,
  subzone text,
  coarse_count int not null default 1,
  expires_at timestamptz not null,              -- <= 10 minutes
  created_at timestamptz not null default now()
);

create table sightings (
  id uuid primary key default gen_random_uuid(),
  target_character_id uuid not null references characters(id),
  zone text not null,
  confidence text not null check (confidence in ('low','medium','high')),
  visible_after timestamptz not null,           -- 5-minute delay
  expires_at timestamptz not null,              -- 15-minute expiry
  created_at timestamptz not null default now()
);

create table crowns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references tournaments(id),
  character_id uuid references characters(id),
  title text not null,
  awarded_at timestamptz not null default now()
);

create index kill_reports_session on kill_reports(session_id);
create index horns_zone_expiry on horns(zone, expires_at);
create index sightings_target on sightings(target_character_id, expires_at);
