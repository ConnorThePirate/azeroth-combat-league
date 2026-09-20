-- 0001: identity (docs/14). UTC timestamptz, immutable UUIDs, RLS everywhere.
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  public_slug text not null unique,
  preferences jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id),
  status text not null default 'active' check (status in ('active','suspended','deleted'))
);

-- Private provider linkage: keyed by validated issuer + subject digest.
-- Provider tokens live only in encrypted_provider_metadata, never in clients.
create table provider_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  issuer text not null,
  subject_digest text not null,
  encrypted_provider_metadata bytea,
  linked_at timestamptz not null default now(),
  unique (issuer, subject_digest)
);

create type verification_tier as enum ('claimed','witnessed','provider_verified');

create table characters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  product text not null,
  environment text not null,
  region text not null,
  realm_id text not null,
  readable_guid text,
  name text not null,
  class_id int not null,
  faction_id int not null,
  level int not null,
  verification_tier verification_tier not null default 'claimed',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Name/realm history: identity never resets on rename or transfer.
create table character_aliases (
  character_id uuid not null references characters(id) on delete cascade,
  realm text not null,
  name text not null,
  valid_from timestamptz not null,
  valid_until timestamptz,
  primary key (character_id, realm, name, valid_from)
);

create table character_verifications (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  method text not null check (method in ('witness','provider')),
  witness_id uuid references profiles(id),
  evidence_ref text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Companion/uploader credentials: digest only, revocable, scoped.
create table installations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  credential_digest text,
  label text not null default '',
  revoked_at timestamptz,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

-- Monotonic snapshot sequences for WFU1 website->addon bundles (docs/06,14).
create table addon_snapshot_counters (
  account_id uuid primary key references accounts(id),
  last_sequence bigint not null default 0 check (last_sequence >= 0 and last_sequence <= 9007199254740991)
);

-- One-use OAuth state bound to the initiating app session.
create table oauth_states (
  digest text primary key,
  initiating_account uuid not null references accounts(id),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index characters_account on characters(account_id);
create index character_verifications_character on character_verifications(character_id);
create index installations_account on installations(account_id);
create index oauth_states_expiry on oauth_states(expires_at) where used_at is null;
