-- 0004: rating projections (docs/09,14). Event-sourced inputs, versioned
-- generations, atomic publication, no escrow/RD tables.

create table rating_policies (
  id uuid primary key default gen_random_uuid(),
  algorithm text not null default 'community-elo-1',
  config jsonb not null,
  published_at timestamptz not null default now()
);

alter table seasons
  add constraint seasons_rating_policy_fk
  foreign key (rating_policy_id) references rating_policies(id);

create table rating_generations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  input_revision bigint not null,
  algorithm_version text not null,
  status text not null default 'building' check (status in ('building','complete','published','superseded','failed')),
  cursor jsonb,                                 -- checkpoint for bounded jobs
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table season_projection_heads (
  season_id uuid primary key references seasons(id),
  active_generation_id uuid references rating_generations(id),
  input_revision bigint not null default 0
);

create table rating_ledger (
  id bigint generated always as identity primary key,
  generation_id uuid not null references rating_generations(id),
  match_id uuid not null references matches(id),
  ladder_key jsonb not null,                    -- [season,pool,bracket,ladder,class|null]
  participant_character_id uuid not null references characters(id),
  before_milli bigint not null,
  delta_milli bigint not null,
  after_milli bigint not null,
  pair_prior_count int not null,
  pair_weight numeric(3,2) not null,
  ordinal bigint not null,
  unique (generation_id, match_id, ladder_key, participant_character_id),
  check (after_milli = before_milli + delta_milli)
);

-- Paired deltas must sum to zero within a committed event; enforced by the
-- trusted projection commit function (assert_pair_conservation) since CHECK
-- cannot span rows.

create table ladder_members (
  generation_id uuid not null references rating_generations(id),
  ladder_key jsonb not null,
  character_id uuid not null references characters(id),
  rating_milli bigint not null,
  positive_series int not null default 0,
  distinct_opponents int not null default 0,
  last_activity timestamptz,
  primary key (generation_id, ladder_key, character_id)
);

create index rating_ledger_match on rating_ledger(match_id);
create index ladder_members_board on ladder_members(ladder_key, generation_id, rating_milli desc);
