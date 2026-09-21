-- Development seed fixtures (docs/24). Synthetic data only — no real players,
-- no production credentials. UUIDs are deterministic for reproducible tests.

-- ---------- configuration ---------------------------------------------------
insert into client_builds (build, notes) values
  ('1.60.1.69913', 'Gethe/wow-ui-source snapshot commit 70ef1b2, reviewed 2026-09-18'),
  ('1.60.2.70001', 'hypothetical newer beta — capabilities unknown');

insert into capability_tests (capability, build, context, status, tester, sample_count) values
  ('duel_outcome_inference','1.60.1.69913','open-world','unknown','lab-pending',0),
  ('combat_log_capture','1.60.1.69913','open-world','observed_source','docs-review',0),
  ('savedvariables_flush','1.60.1.69913','reload','unknown','lab-pending',0),
  ('same_faction_transport','1.60.1.69913','whisper','unknown','lab-pending',0),
  ('cross_faction_transport','1.60.1.69913','gurubashi','unknown','lab-pending',0);

insert into feature_flags (flag, enabled, owner, fallback) values
  ('same_faction_contracts', true, 'lab', 'practice only'),
  ('duel_outcome_inference', false, 'lab', 'attested result card'),
  ('combat_log_capture', false, 'lab', 'attested rules'),
  ('item_detection', false, 'lab', 'attested rules'),
  ('cross_faction_contracts', false, 'lab', 'website enrollment + referee'),
  ('savedvariables_uploader', false, 'lab', 'copy results recovery'),
  ('disk_log_upload', false, 'lab', 'savedvariables only'),
  ('signed_peer_receipts', false, 'lab', 'each participant uploads own'),
  ('report_relay', false, 'lab', 'none'),
  ('inbound_rating_bridge', false, 'lab', 'copy addon update'),
  ('hub_board', false, 'lab', 'no board'),
  ('world_events', false, 'lab', 'journal only'),
  ('world_score', false, 'lab', 'journal only'),
  ('pit_score', false, 'lab', 'journal only'),
  ('native_teams', false, 'lab', 'none'),
  ('team_rating', false, 'lab', 'none');

insert into level_brackets (id, level_min, level_max) values
  ('10000000-0000-4000-8000-000000000001', 20, 20),
  ('10000000-0000-4000-8000-000000000002', 30, 30);

insert into competition_pools (id, name, scheme) values
  ('20000000-0000-4000-8000-000000000001', 'Beta Alliance', '{"factions":[0],"realms":["forever-beta"]}'),
  ('20000000-0000-4000-8000-000000000002', 'Beta Horde',    '{"factions":[1],"realms":["forever-beta"]}');

insert into rating_policies (id, algorithm, config) values
  ('30000000-0000-4000-8000-000000000001', 'community-elo-1',
   '{"k":32,"initialMilli":1500000,"pairWindowDays":7,"weights":[1,0.5,0.25,0]}');

insert into seasons (id, name, level_bracket_id, rating_policy_id, pool_scheme, starts_at, ends_at, archived) values
  ('40000000-0000-4000-8000-000000000001', 'Cap 20 Season (archived)',
    '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
    '{}', '2026-08-01', '2026-09-01', true),
  ('40000000-0000-4000-8000-000000000002', 'Cap 30 Beta',
    '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001',
    '{}', '2026-09-10', null, false);

-- ---------- rulesets ----------------------------------------------------------
insert into ruleset_versions (id, ruleset_id, version, is_standard, content, content_hash) values
  ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-0000000000a1'::uuid, 1, true,
   '{"name":"Standard","rules":[
      {"rule_id":"std.no-active-consumables","category":"consumable","action":"deny","phase":"active"},
      {"rule_id":"std.no-engineering","category":"engineering","action":"deny","phase":"active"},
      {"rule_id":"std.bandages-ok","category":"bandage","action":"allow","phase":"active"},
      {"rule_id":"std.no-external-buffs","category":"external_buff","action":"deny","phase":"ready"}]}',
   'pending'),
  ('50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-0000000000a2'::uuid, 1, false,
   '{"name":"Pure Duel","rules":[
      {"rule_id":"pure.class-only","category":"all_consumables","action":"deny","phase":"active"}]}',
   'pending2'),
  ('50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-0000000000a3'::uuid, 1, false,
   '{"name":"Fieldcraft","rules":[
      {"rule_id":"fc.declared-consumables","category":"consumable","action":"limit","phase":"active","count_limit":2}]}',
   'pending3'),
  ('50000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-0000000000a4'::uuid, 1, false,
   '{"name":"Anything Goes","rules":[]}', 'pending4');

-- ---------- people ------------------------------------------------------------
insert into profiles (id, public_slug) values
  ('60000000-0000-4000-8000-000000000001', 'tester-a'),
  ('60000000-0000-4000-8000-000000000002', 'tester-b'),
  ('60000000-0000-4000-8000-000000000003', 'referee-rose'),
  ('60000000-0000-4000-8000-000000000004', 'owner-ora'),
  ('60000000-0000-4000-8000-000000000005', 'newbie-ned');

insert into accounts (id, profile_id) values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002'),
  ('61000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003'),
  ('61000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004'),
  ('61000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005');

insert into characters (id, account_id, product, environment, region, realm_id, name, class_id, faction_id, level, verification_tier, verified_at) values
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'forever', 'beta', 'dev', 'forever-beta', 'Alpha Dawnspear', 8, 0, 30, 'witnessed', now()),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'forever', 'beta', 'dev', 'forever-beta', 'Bravo Nightbloom', 4, 0, 30, 'witnessed', now()),
  ('62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000001', 'forever', 'beta', 'dev', 'forever-beta', 'Alpha Altsworn', 1, 0, 30, 'witnessed', now()),
  ('62000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000005', 'forever', 'beta', 'dev', 'forever-beta', 'Neddy Cogsworth', 9, 0, 22, 'claimed', null),
  ('62000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000003', 'forever', 'beta', 'dev', 'forever-beta', 'Rose Thorne', 5, 0, 30, 'provider_verified', now());

insert into installations (id, account_id, label, credential_digest, last_seen) values
  ('63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'A-desktop', 'dev-digest-a', now()),
  ('63000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'B-laptop', 'dev-digest-b', now()),
  ('63000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000002', 'B-revoked', 'dev-digest-x', now());
update installations set revoked_at = now() where id = '63000000-0000-4000-8000-000000000003';

-- ---------- matches in every state --------------------------------------------
insert into match_contracts (id, contract_hash, canonical, season_id, pool_id, ruleset_version_id, rated_intent, ladder, best_of, level_min, level_max, accepted_expiry) values
  ('70000000-0000-4000-8000-000000000001', 'hash-corr', '{}', '40000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', true, 'open', 3, 30, 30, now() + interval '1 day'),
  ('70000000-0000-4000-8000-000000000002', 'hash-await', '{}', '40000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', true, 'open', 1, 30, 30, now() + interval '1 day'),
  ('70000000-0000-4000-8000-000000000003', 'hash-custom', '{}', '40000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', false, null, 1, 30, 30, now() + interval '1 day'),
  ('70000000-0000-4000-8000-000000000004', 'hash-disputed', '{}', '40000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', true, 'open', 1, 30, 30, now() + interval '1 day');

insert into matches (id, lifecycle, evidence, rating, first_seen_at, receipt_seq, finished_at) values
  ('70000000-0000-4000-8000-000000000001', 'finished', 'corroborated', 'applied', now() - interval '2 days', 1, now() - interval '2 days'),
  ('70000000-0000-4000-8000-000000000002', 'finished', 'awaiting', 'ineligible', now() - interval '1 day', 2, now() - interval '1 day'),
  ('70000000-0000-4000-8000-000000000003', 'finished', 'corroborated', 'ineligible', now() - interval '1 day', 3, now() - interval '1 day'),
  ('70000000-0000-4000-8000-000000000004', 'finished', 'disputed', 'held', now() - interval '3 hours', 4, now() - interval '3 hours');

insert into match_participants (match_id, character_id, account_id_at_match, side) values
  ('70000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 1),
  ('70000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 2),
  ('70000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 1),
  ('70000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 2),
  ('70000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 1),
  ('70000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 2),
  ('70000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 1),
  ('70000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000003', 2);

insert into match_games (match_id, game_index, winner_character_id, finish_reason) values
  ('70000000-0000-4000-8000-000000000001', 0, '62000000-0000-4000-8000-000000000001', 'death'),
  ('70000000-0000-4000-8000-000000000001', 1, '62000000-0000-4000-8000-000000000001', 'death'),
  ('70000000-0000-4000-8000-000000000002', 0, '62000000-0000-4000-8000-000000000002', 'surrender'),
  ('70000000-0000-4000-8000-000000000003', 0, '62000000-0000-4000-8000-000000000001', 'death'),
  ('70000000-0000-4000-8000-000000000004', 0, null, 'unknown');

insert into disputes (id, match_id, filed_by, kind, detail) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004',
   '60000000-0000-4000-8000-000000000003', 'outcome_conflict', 'Reports disagree on winner');

-- ---------- events -------------------------------------------------------------
insert into tournaments (id, organizer_id, name, visibility, format, ruleset_version_id, status, starts_at) values
  ('72000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'Friday Fight Night', 'public', 'single_elimination',
   '50000000-0000-4000-8000-000000000001', 'published', now() + interval '3 days'),
  ('72000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 'Guild Internal', 'private', 'round_robin',
   '50000000-0000-4000-8000-000000000004', 'draft', null),
  ('72000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004', 'Rookie Cup', 'unlisted', 'single_elimination',
   '50000000-0000-4000-8000-000000000001', 'registration', now() + interval '7 days');

insert into event_staff (event_id, profile_id, role) values
  ('72000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'referee');

-- Witness check-ins are event-scoped (0011): referee-rose verified these
-- characters at Friday Fight Night check-in.
insert into character_verifications (character_id, method, witness_id, event_id, status) values
  ('62000000-0000-4000-8000-000000000001', 'witness', '60000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', 'approved'),
  ('62000000-0000-4000-8000-000000000002', 'witness', '60000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', 'approved'),
  ('62000000-0000-4000-8000-000000000003', 'witness', '60000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', 'approved');

insert into event_members (event_id, account_id, invited_by) values
  ('72000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001');
