-- 0011_witness_scope.sql — witness identity checks are event-scoped.
--
-- Product rule (docs/26 + owner direction): "witnessed" is an *identity*
-- verification performed by event staff the organizer designated — a
-- check-in, not a per-duel concept. Regular ladder duels are corroborated
-- by the two clients' independent reports; nobody witnesses them.
--
-- For method='witness', event_id names the event at which the check-in
-- happened and witness_id must be the event organizer or hold an
-- event_staff role for that event. Enforced in the database by the
-- trigger below, so no write path can bypass it.

alter table character_verifications
  add column event_id uuid references tournaments(id);

-- A witness-method verification must name its event; provider-method
-- verifications never do (they come from the OAuth adapter).
-- NOTE: applying this to a populated database requires backfilling
-- event_id on existing witness rows first.
alter table character_verifications
  add constraint witness_requires_event
  check ( (method = 'witness') = (event_id is not null) );

comment on column character_verifications.event_id is
  'Witness check-ins happen at events: the organizer''s designated staff (event_staff) verify the character. NULL iff method = ''provider''.';

-- The witness must be the event's organizer or a designated staff member.
-- Cross-table rule — cannot be expressed as a CHECK, hence the trigger.
create or replace function enforce_witness_is_event_staff() returns trigger
  language plpgsql as $$
begin
  if new.method <> 'witness' then
    return new;
  end if;
  if new.witness_id is null then
    raise exception 'witness verification requires witness_id';
  end if;
  if not exists (
    select 1
    from tournaments t
    left join event_staff s
      on s.event_id = t.id and s.profile_id = new.witness_id
    where t.id = new.event_id
      and (t.organizer_id = new.witness_id or s.profile_id is not null)
  ) then
    raise exception
      'witness % is not the organizer or designated staff of event %',
      new.witness_id, new.event_id;
  end if;
  return new;
end $$;

create trigger character_verifications_witness_staff
  before insert or update of method, event_id, witness_id
  on character_verifications
  for each row execute function enforce_witness_is_event_staff();

create index character_verifications_event on character_verifications(event_id);
