-- CI-only prelude applied before supabase/migrations in the postgres job.
-- The supabase/postgres image provides these; create-if-missing keeps the
-- migration run self-contained on a plain Postgres-compatible service.
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

-- auth.uid()/auth.jwt() are Supabase Auth primitives referenced by RLS
-- helpers (0007). The service image ships them; stub null-returning
-- versions when it does not.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
  language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select '{}'::jsonb $$;
