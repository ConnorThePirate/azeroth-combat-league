-- 0012_auth_link.sql — accounts.auth_user_id is the Supabase Auth link.
--
-- The column itself arrived in 0007 (RLS: current_account_id() maps
-- auth.uid() -> accounts.id). It now also serves the API's session path:
-- PgAuthStore validates a Supabase access token against /auth/v1/user and,
-- on first sign-in, auto-provisions a profile + account row keyed by
-- auth_user_id. NULL for every account that predates real login — those
-- rows are unaffected and can be linked later.
--
-- Guarded with `if not exists` like 0007's original add, so this is a
-- no-op where the schema is already applied.

alter table accounts add column if not exists auth_user_id uuid unique;

comment on column accounts.auth_user_id is
  'Supabase auth.users.id that owns this account — set on first sign-in when the API auto-provisions profile+account. NULL for accounts created before Supabase Auth. RLS reads it via current_account_id() = auth.uid().';
