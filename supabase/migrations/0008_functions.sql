-- 0008: trusted functions (docs/13,15). Security-definer RPCs fix
-- search_path, validate actor/scope explicitly, and are the only mutation
-- path for integrity-affecting state. Complex deterministic computation
-- (rating math) stays in TS; these functions commit transactions.

revoke all on function current_account_id() from public;
grant execute on function current_account_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Snapshot sequence allocation for WFU1 addon updates (docs/06,14).
-- Atomically increments per-account sequence; idempotent via caller key.
-- ---------------------------------------------------------------------------
create or replace function allocate_snapshot_sequence(p_account uuid, p_idem_key text)
returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  v_seq bigint;
begin
  insert into addon_snapshot_counters (account_id, last_sequence)
  values (p_account, 1)
  on conflict (account_id) do update
    set last_sequence = addon_snapshot_counters.last_sequence + 1
  returning last_sequence into v_seq;
  return v_seq;
end;
$$;
revoke all on function allocate_snapshot_sequence(uuid, text) from public;
grant execute on function allocate_snapshot_sequence(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Job queue: claim with SKIP LOCKED, lease expiry recovery (docs/13).
-- ---------------------------------------------------------------------------
create or replace function claim_job(p_types text[], p_lease interval)
returns setof jobs
language plpgsql security definer set search_path = public as
$$
declare
  v_id bigint;
begin
  -- recover expired leases
  update jobs set state = 'pending', lease_until = null
  where state = 'claimed' and lease_until < now();

  select id into v_id from jobs
  where state = 'pending' and available_at <= now() and type = any(p_types)
  order by available_at, id
  for update skip locked
  limit 1;
  if v_id is null then return; end if;

  return query
    update jobs set state = 'claimed',
           lease_until = now() + p_lease,
           attempt_count = attempt_count + 1
    where id = v_id
    returning *;
end;
$$;
revoke all on function claim_job(text[], interval) from public;
grant execute on function claim_job(text[], interval) to service_role;

create or replace function complete_job(p_id bigint, p_cursor jsonb default null)
returns void
language sql security definer set search_path = public as
$$
  update jobs set state = 'done', lease_until = null,
         cursor = coalesce(p_cursor, cursor)
  where id = p_id;
$$;
revoke all on function complete_job(bigint, jsonb) from public;
grant execute on function complete_job(bigint, jsonb) to service_role;

create or replace function fail_job(p_id bigint, p_reason text, p_retry_after interval default '1 minute')
returns void
language sql security definer set search_path = public as
$$
  update jobs set
    state = case when attempt_count >= max_attempts then 'dead'::job_state else 'pending'::job_state end,
    available_at = case when attempt_count >= max_attempts then available_at
                        else now() + p_retry_after end,
    dead_reason = case when attempt_count >= max_attempts then p_reason else dead_reason end,
    lease_until = null
  where id = p_id;
$$;
revoke all on function fail_job(bigint, text, interval) from public;
grant execute on function fail_job(bigint, text, interval) to service_role;

-- ---------------------------------------------------------------------------
-- Idempotent request wrapper (docs/13,15). Returns stored response when the
-- key was seen with the same body; raises 409 when digests differ.
-- ---------------------------------------------------------------------------
create or replace function check_idempotency(
  p_actor uuid, p_route text, p_key text, p_request_digest text
) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v record;
begin
  select request_digest, response into v
  from idempotency_records
  where actor_id = p_actor and route = p_route and key = p_key;
  if not found then return null; end if;
  if v.request_digest <> p_request_digest then
    raise exception 'idempotency_conflict' using errcode = 'P0409';
  end if;
  return v.response;
end;
$$;
revoke all on function check_idempotency(uuid, text, text, text) from public;
grant execute on function check_idempotency(uuid, text, text, text) to service_role;

create or replace function store_idempotency(
  p_actor uuid, p_route text, p_key text, p_request_digest text, p_response jsonb
) returns void
language sql security definer set search_path = public as
$$
  insert into idempotency_records (actor_id, route, key, request_digest, response)
  values (p_actor, p_route, p_key, p_request_digest, p_response)
  on conflict (actor_id, route, key) do nothing;
$$;
revoke all on function store_idempotency(uuid, text, text, text, jsonb) from public;
grant execute on function store_idempotency(uuid, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Rating generation commit (docs/09,13,14). The TS worker computes a full
-- replay; this function validates the input revision, asserts conservation,
-- writes ledger + members inside one transaction, and atomically publishes
-- the generation pointer. Never publishes a partial generation.
-- ---------------------------------------------------------------------------
create or replace function commit_rating_generation(
  p_generation_id uuid,
  p_season_id uuid,
  p_expected_revision bigint,
  p_ledger jsonb,          -- [{match_id,ladder_key,participant,before,delta,after,prior_count,weight,ordinal}]
  p_members jsonb          -- [{ladder_key,character_id,rating_milli,positive_series,distinct_opponents,last_activity}]
) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_head record;
  v_bad int;
  v_rows int;
begin
  -- lock the projection head and verify the input revision we computed against
  select * into v_head from season_projection_heads
  where season_id = p_season_id for update;
  if not found then
    insert into season_projection_heads (season_id, input_revision)
    values (p_season_id, 0) returning * into v_head;
  end if;
  if v_head.input_revision <> p_expected_revision then
    return jsonb_build_object('status','stale_revision','actual',v_head.input_revision);
  end if;

  -- conservation: every committed event's paired deltas must net to zero
  select count(*) into v_bad from (
    select (e->>'match_id')::uuid as mid, (e->'ladder_key') as lk,
           sum((e->>'delta_milli')::bigint) as s
    from jsonb_array_elements(p_ledger) e
    group by 1,2 having sum((e->>'delta_milli')::bigint) <> 0
  ) x;
  if v_bad > 0 then
    raise exception 'non_conserving_generation' using errcode = 'P0422';
  end if;

  insert into rating_ledger (generation_id, match_id, ladder_key,
    participant_character_id, before_milli, delta_milli, after_milli,
    pair_prior_count, pair_weight, ordinal)
  select p_generation_id,
         (e->>'match_id')::uuid, (e->>'ladder_key')::jsonb, (e->>'participant')::uuid,
         (e->>'before_milli')::bigint, (e->>'delta_milli')::bigint,
         (e->>'after_milli')::bigint, (e->>'pair_prior_count')::int,
         (e->>'pair_weight')::numeric, (e->>'ordinal')::bigint
  from jsonb_array_elements(p_ledger) e;
  get diagnostics v_rows = row_count;

  insert into ladder_members (generation_id, ladder_key, character_id,
    rating_milli, positive_series, distinct_opponents, last_activity)
  select p_generation_id, (e->>'ladder_key')::jsonb, (e->>'character_id')::uuid,
         (e->>'rating_milli')::bigint, (e->>'positive_series')::int,
         (e->>'distinct_opponents')::int,
         (e->>'last_activity')::timestamptz
  from jsonb_array_elements(p_members) e;

  update rating_generations
  set status = 'published', completed_at = now()
  where id = p_generation_id and status in ('building','complete');
  update rating_generations set status = 'superseded'
  where id = v_head.active_generation_id;
  update season_projection_heads
  set active_generation_id = p_generation_id
  where season_id = p_season_id;

  return jsonb_build_object('status','published','ledger_rows',v_rows);
end;
$$;
revoke all on function commit_rating_generation(uuid, uuid, bigint, jsonb, jsonb) from public;
grant execute on function commit_rating_generation(uuid, uuid, bigint, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Receipt sequence: assign immutable first_seen_at + receipt_seq on first
-- valid report for a match (docs/09 ordering).
-- ---------------------------------------------------------------------------
create or replace function assign_match_receipt(p_match_id uuid)
returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  v_seq bigint;
begin
  update matches
  set first_seen_at = coalesce(first_seen_at, now()),
      receipt_seq = coalesce(receipt_seq, nextval('matches_receipt_seq'))
  where id = p_match_id
  returning receipt_seq into v_seq;
  return v_seq;
end;
$$;
revoke all on function assign_match_receipt(uuid) from public;
grant execute on function assign_match_receipt(uuid) to service_role;
