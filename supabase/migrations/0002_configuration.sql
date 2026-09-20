-- 0002: configuration (docs/14). Immutable published versions; capability
-- tests distinguish source-only from live-tested evidence.

create table client_builds (
  id uuid primary key default gen_random_uuid(),
  build text not null unique,           -- e.g. "1.60.1.69913"
  notes text not null default '',
  first_seen_at timestamptz not null default now()
);

create table capability_tests (
  id uuid primary key default gen_random_uuid(),
  capability text not null,
  build text not null references client_builds(build),
  context text not null,
  status text not null check (status in ('observed_source','tested_pass','partial','fail','unknown')),
  tested_at timestamptz,
  sample_count int not null default 0,
  false_positives int not null default 0,
  false_negatives int not null default 0,
  coverage_gaps text not null default '',
  fixture_path text,
  tester text,
  unique (capability, build, context)
);

create table feature_flags (
  flag text primary key,
  enabled boolean not null default false,  -- unknown defaults off
  contexts jsonb not null default '{}'::jsonb,
  evidence_fixture text,
  last_tested_at timestamptz,
  owner text,
  fallback text not null default ''
);

create table detector_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  build text not null references client_builds(build),
  catalog jsonb not null,                  -- item->effect mappings, provenance
  published_at timestamptz not null default now()
);

create table ruleset_versions (
  id uuid primary key default gen_random_uuid(),
  ruleset_id uuid not null,
  version int not null,
  owner_profile_id uuid references profiles(id),
  is_standard boolean not null default false,
  content jsonb not null,
  content_hash text not null,              -- sha256 of canonical content bytes
  published_at timestamptz not null default now(),
  unique (ruleset_id, version),
  unique (content_hash)
);

create table competition_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scheme jsonb not null,                   -- connected region/realm/faction set
  active boolean not null default true
);

create table level_brackets (
  id uuid primary key default gen_random_uuid(),
  level_min int not null,
  level_max int not null,
  unique (level_min, level_max),
  check (level_min <= level_max)
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level_bracket_id uuid not null references level_brackets(id),
  rating_policy_id uuid,
  pool_scheme jsonb not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  archived boolean not null default false
);

create table hub_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  map_id int,
  area_id int,
  faction_id int,
  notes text not null default ''
);
