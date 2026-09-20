-- 0009_pairing.sql — companion device pairing (docs/27).
--
-- Flow: companion POSTs /v1/pair/start -> row here with device_code +
-- human user_code. The signed-in website user approves the user_code on
-- /v1/pair/approve; the companion polls /v1/pair/poll and receives a
-- scoped reporting credential. Only the credential DIGEST is stored on
-- installations.credential_digest — raw tokens never persist.

create table pair_requests (
  device_code uuid primary key default gen_random_uuid(),
  user_code text not null unique,
  -- The install the companion wants to pair. No FK: the installations row
  -- is created in the same transaction that approves + issues the credential.
  installation_id uuid not null,
  approved_account_id uuid references accounts(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,           -- set when the credential was issued
  check (char_length(user_code) between 4 and 12)
);

-- Expired requests are garbage-collected by the janitor job; index covers it.
create index pair_requests_expiry on pair_requests(expires_at) where consumed_at is null;
create index pair_requests_user_code on pair_requests(user_code) where consumed_at is null;

-- No public access: all reads/writes go through trusted service functions.
alter table pair_requests enable row level security;

comment on table pair_requests is
  'Pending companion device pairings. service_role only — the API checks expiry, approval, and single-use consumption.';
comment on column pair_requests.user_code is
  'Short human code the player types on the website (Crockford-ish alphabet, no 0/O/1/I).';
comment on column pair_requests.approved_account_id is
  'Set when a signed-in account approves the code; the device then polls to receive its scoped credential.';
