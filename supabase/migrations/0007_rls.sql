-- 0007: row-level security (docs/14,16).
-- App users authenticate via Supabase Auth; accounts.auth_user_id maps the
-- auth principal to a platform account. Mutations that affect integrity go
-- through security-definer functions only — clients never write ledger,
-- decisions, roles, provider identity or capability rows directly.

alter table accounts add column if not exists auth_user_id uuid unique;

create or replace function current_account_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from accounts where auth_user_id = auth.uid() $$;

-- ---------- enable --------------------------------------------------------
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table provider_identities enable row level security;
alter table characters enable row level security;
alter table character_aliases enable row level security;
alter table character_verifications enable row level security;
alter table installations enable row level security;
alter table addon_snapshot_counters enable row level security;
alter table oauth_states enable row level security;
alter table client_builds enable row level security;
alter table capability_tests enable row level security;
alter table feature_flags enable row level security;
alter table detector_catalog_versions enable row level security;
alter table ruleset_versions enable row level security;
alter table competition_pools enable row level security;
alter table level_brackets enable row level security;
alter table seasons enable row level security;
alter table hub_definitions enable row level security;
alter table match_contracts enable row level security;
alter table match_participants enable row level security;
alter table match_reports enable row level security;
alter table match_report_revisions enable row level security;
alter table report_evidence enable row level security;
alter table matches enable row level security;
alter table match_games enable row level security;
alter table adjudications enable row level security;
alter table rating_policies enable row level security;
alter table rating_generations enable row level security;
alter table season_projection_heads enable row level security;
alter table rating_ledger enable row level security;
alter table ladder_members enable row level security;
alter table tournaments enable row level security;
alter table event_staff enable row level security;
alter table event_members enable row level security;
alter table registrations enable row level security;
alter table entrant_members enable row level security;
alter table check_ins enable row level security;
alter table bracket_nodes enable row level security;
alter table event_matches enable row level security;
alter table rules_acceptances enable row level security;
alter table announcements enable row level security;
alter table world_opt_ins enable row level security;
alter table world_sessions enable row level security;
alter table kill_reports enable row level security;
alter table kill_decisions enable row level security;
alter table score_ledger enable row level security;
alter table pit_lives enable row level security;
alter table horns enable row level security;
alter table sightings enable row level security;
alter table crowns enable row level security;
alter table disputes enable row level security;
alter table evidence_attachments enable row level security;
alter table moderation_actions enable row level security;
alter table sanctions enable row level security;
alter table appeals enable row level security;
alter table audit_events enable row level security;
alter table idempotency_records enable row level security;
alter table jobs enable row level security;

-- ---------- public reads ---------------------------------------------------
-- Published, sanitized community data: matches, rules, events, standings.
create policy profiles_public_read on profiles for select
  using (status = 'active');
create policy characters_public_read on characters for select
  using (true);                              -- character identity is public for ranked history
create policy aliases_public_read on character_aliases for select using (true);
create policy builds_public_read on client_builds for select using (true);
create policy capabilities_public_read on capability_tests for select using (true);
create policy flags_public_read on feature_flags for select using (true);
create policy catalog_public_read on detector_catalog_versions for select using (true);
create policy rulesets_public_read on ruleset_versions for select using (true);
create policy pools_public_read on competition_pools for select using (true);
create policy brackets_public_read on level_brackets for select using (true);
create policy seasons_public_read on seasons for select using (true);
create policy hubs_public_read on hub_definitions for select using (true);
create policy contracts_public_read on match_contracts for select using (true);
create policy participants_public_read on match_participants for select using (true);
create policy matches_public_read on matches for select using (true);
create policy games_public_read on match_games for select using (true);
create policy policies_public_read on rating_policies for select using (true);
create policy generations_public_read on rating_generations for select using (true);
create policy heads_public_read on season_projection_heads for select using (true);
create policy ledger_public_read on rating_ledger for select using (true);
create policy members_public_read on ladder_members for select using (true);
create policy tournaments_public_read on tournaments for select
  using (visibility = 'public'
         or (visibility = 'unlisted')
         or exists (select 1 from event_members m
                    where m.event_id = tournaments.id
                      and m.account_id = current_account_id()));
create policy staff_public_read on event_staff for select using (true);
create policy registrations_public_read on registrations for select using (true);
create policy entrants_public_read on entrant_members for select using (true);
create policy checkins_public_read on check_ins for select using (true);
create policy nodes_public_read on bracket_nodes for select using (true);
create policy eventmatches_public_read on event_matches for select using (true);
create policy announcements_public_read on announcements for select using (true);
create policy crowns_public_read on crowns for select using (true);
create policy score_public_read on score_ledger for select using (true);
create policy sightings_public_read on sightings for select
  using (visible_after <= now() and expires_at > now());
create policy horns_public_read on horns for select
  using (expires_at > now());

-- ---------- owner-only private data ----------------------------------------
create policy accounts_owner on accounts for select
  using (id = current_account_id());
create policy provider_owner on provider_identities for select
  using (account_id = current_account_id());
create policy verifications_owner_or_staff on character_verifications for select
  using (exists (select 1 from characters c
                 where c.id = character_verifications.character_id
                   and c.account_id = current_account_id()));
create policy installations_owner on installations for select
  using (account_id = current_account_id());
create policy snapshots_owner on addon_snapshot_counters for select
  using (account_id = current_account_id());
create policy reports_own on match_reports for select
  using (origin_account_id = current_account_id());
create policy revisions_own on match_report_revisions for select
  using (exists (select 1 from match_reports r
                 where r.id = report_id and r.origin_account_id = current_account_id()));
-- report_evidence is private: only its origin account and staff functions.
create policy evidence_own on report_evidence for select
  using (exists (select 1 from match_reports r
                 where r.id = report_id and r.origin_account_id = current_account_id()));
create policy adjudications_participant on adjudications for select
  using (exists (select 1 from match_participants mp
                 join characters c on c.id = mp.character_id
                 where mp.match_id = adjudications.match_id
                   and c.account_id = current_account_id()));
create policy members_self on event_members for select
  using (account_id = current_account_id());
create policy acceptances_owner on rules_acceptances for select
  using (account_id = current_account_id());
create policy optins_owner on world_opt_ins for select
  using (account_id = current_account_id());
create policy sessions_owner on world_sessions for select
  using (account_id = current_account_id());
create policy killreports_owner on kill_reports for select
  using (exists (select 1 from world_sessions s
                 where s.id = session_id and s.account_id = current_account_id()));
create policy killdecisions_owner on kill_decisions for select
  using (exists (select 1 from kill_reports kr
                 join world_sessions s on s.id = kr.session_id
                 where kr.id = kill_report_id and s.account_id = current_account_id()));
create policy pitlives_owner on pit_lives for select
  using (exists (select 1 from world_sessions s
                 where s.id = session_id and s.account_id = current_account_id()));
create policy disputes_participant_or_filer on disputes for select
  using (filed_by = (select profile_id from accounts where id = current_account_id())
         or exists (select 1 from match_participants mp
                    join characters c on c.id = mp.character_id
                    where mp.match_id = disputes.match_id
                      and c.account_id = current_account_id()));
create policy attachments_scoped on evidence_attachments for select
  using (exists (select 1 from disputes d
                 where d.id = dispute_id and d.filed_by =
                   (select profile_id from accounts where id = current_account_id())));
create policy modactions_participant on moderation_actions for select
  using (exists (select 1 from disputes d
                 where d.id = case_id and d.filed_by =
                   (select profile_id from accounts where id = current_account_id())));
create policy sanctions_owner on sanctions for select
  using (account_id = current_account_id());
create policy appeals_owner on appeals for select
  using (filed_by = (select profile_id from accounts where id = current_account_id()));

-- ---------- writes ----------------------------------------------------------
-- No direct client writes to integrity tables. Only narrowly-scoped inserts
-- the API contract allows; everything else goes through trusted functions.
create policy disputes_insert on disputes for insert
  with check (filed_by = (select profile_id from accounts where id = current_account_id())
              and exists (select 1 from match_participants mp
                          join characters c on c.id = mp.character_id
                          where mp.match_id = disputes.match_id
                            and c.account_id = current_account_id()));
create policy appeals_insert on appeals for insert
  with check (filed_by = (select profile_id from accounts where id = current_account_id()));
create policy rules_acceptances_insert on rules_acceptances for insert
  with check (account_id = current_account_id());
create policy optins_upsert on world_opt_ins for insert
  with check (account_id = current_account_id());
create policy optins_update on world_opt_ins for update
  using (account_id = current_account_id()) with check (account_id = current_account_id());
create policy characters_claim on characters for insert
  with check (account_id = current_account_id() and verification_tier = 'claimed');
create policy profiles_self_update on profiles for update
  using (id = (select profile_id from accounts where id = current_account_id()))
  with check (id = (select profile_id from accounts where id = current_account_id()));

-- jobs, audit_events, idempotency_records, oauth_states, moderation internals:
-- no client policies at all — service role only.
