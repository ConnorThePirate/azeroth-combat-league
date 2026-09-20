-- 0013: production bootstrap — operational configuration only.
-- No players, accounts, matches, or events; those come from real usage.
-- Idempotent (on conflict do nothing) so it is safe to re-run.
-- The b0000000-…-NNNN UUID range marks bootstrap-owned rows.
-- The addon receives seasonId/poolId/rulesetVersionId via WFU1 config
-- (Core/State.lua "server-issued ids"), so these ids are canonical.

-- ---------- client builds + capability ledger (honest: unproven = off) ----
insert into client_builds (build, notes) values
  ('1.60.1.69913', 'WoW Forever beta build — capabilities under lab measurement')
  on conflict do nothing;

insert into capability_tests (capability, build, context, status, tester, sample_count) values
  ('duel_outcome_inference','1.60.1.69913','open-world','unknown','lab-pending',0),
  ('combat_log_capture','1.60.1.69913','open-world','observed_source','docs-review',0),
  ('savedvariables_flush','1.60.1.69913','reload','unknown','lab-pending',0),
  ('same_faction_transport','1.60.1.69913','whisper','unknown','lab-pending',0),
  ('cross_faction_transport','1.60.1.69913','gurubashi','unknown','lab-pending',0)
  on conflict do nothing;

insert into feature_flags (flag, enabled, owner, fallback) values
  ('same_faction_contracts', true, 'ops', 'practice only'),
  ('duel_outcome_inference', false, 'ops', 'attested result card'),
  ('combat_log_capture', false, 'ops', 'attested rules'),
  ('item_detection', false, 'ops', 'attested rules'),
  ('cross_faction_contracts', false, 'ops', 'website enrollment + referee'),
  ('savedvariables_uploader', false, 'ops', 'copy results recovery'),
  ('disk_log_upload', false, 'ops', 'savedvariables only'),
  ('signed_peer_receipts', false, 'ops', 'each participant uploads own'),
  ('report_relay', false, 'ops', 'none'),
  ('inbound_rating_bridge', false, 'ops', 'copy addon update'),
  ('hub_board', false, 'ops', 'no board'),
  ('world_events', false, 'ops', 'journal only'),
  ('world_score', false, 'ops', 'journal only'),
  ('pit_score', false, 'ops', 'journal only'),
  ('native_teams', false, 'ops', 'none'),
  ('team_rating', false, 'ops', 'none')
  on conflict do nothing;

-- ---------- competition shape --------------------------------------------
-- One pool for the realm; extend when cross-realm/faction ladders exist.
insert into level_brackets (id, level_min, level_max) values
  ('b0000000-0000-4000-8000-000000000001', 60, 60)
  on conflict do nothing;

insert into competition_pools (id, name, scheme) values
  ('b0000000-0000-4000-8000-000000000002', 'Forever', '{}'::jsonb)
  on conflict do nothing;

insert into rating_policies (id, algorithm, config) values
  ('b0000000-0000-4000-8000-000000000003', 'community-elo-1',
   '{"k":32,"initialMilli":1500000,"pairWindowDays":7,"weights":[1,0.5,0.25,0]}'::jsonb)
  on conflict do nothing;

-- Season id is the server's default ACL_SEASON fallback (serve.ts), so a
-- Postgres deploy works with no season env var; set ACL_SEASON to override
-- when running parallel seasons later.
insert into seasons (id, name, level_bracket_id, rating_policy_id, pool_scheme,
                     starts_at, archived) values
  ('00000000-0000-4000-8000-0000000000aa', 'Season 1',
   'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003',
   '{}'::jsonb, now(), false)
  on conflict do nothing;

-- ---------- rulesets -------------------------------------------------------
-- content.rules uses the wire RuleClause shape (camelCase — see
-- packages/contracts/src/types.ts). Standard mirrors the addon's
-- `standard` template; the rest are community presets players can pick.
insert into ruleset_versions
  (id, ruleset_id, version, is_standard, content, content_hash) values
  ('b0000000-0000-4000-8000-000000000010',
   'b0000000-0000-4000-8000-0000000000a1', 1, true,
   '{"name":"Ranked Standard",
     "description":"Class abilities, self buffs, bandages. No active-game consumables or engineering.",
     "rules":[
       {"ruleId":"std.consumables","category":"consumable","action":"deny","phase":"active","detectorId":"combat_log.use","sanction":"game_loss"},
       {"ruleId":"std.engineering","category":"engineering","action":"deny","phase":"active","detectorId":"combat_log.use","sanction":"game_loss"},
       {"ruleId":"std.worldbuffs","category":"world_buff","action":"deny","phase":"ready","detectorId":"aura.inspect","sanction":"game_loss"},
       {"ruleId":"std.outside","category":"outside_assistance","action":"deny","phase":"active","detectorId":"combat_log.source","sanction":"void_game"}]}'::jsonb,
   'bootstrap-std-v1'),
  ('b0000000-0000-4000-8000-000000000011',
   'b0000000-0000-4000-8000-0000000000a2', 1, false,
   '{"name":"Pure Duel",
     "description":"Class kit only — no consumables of any kind.",
     "rules":[
       {"ruleId":"pure.all-consumables","category":"all_consumables","action":"deny","phase":"active","detectorId":"combat_log.use","sanction":"game_loss"}]}'::jsonb,
   'bootstrap-pure-v1'),
  ('b0000000-0000-4000-8000-000000000012',
   'b0000000-0000-4000-8000-0000000000a3', 1, false,
   '{"name":"Fieldcraft",
     "description":"Up to two declared consumables allowed per series.",
     "rules":[
       {"ruleId":"fc.declared-consumables","category":"consumable","action":"limit","phase":"active","countLimit":2,"detectorId":"combat_log.use","sanction":"game_loss"}]}'::jsonb,
   'bootstrap-fc-v1'),
  ('b0000000-0000-4000-8000-000000000013',
   'b0000000-0000-4000-8000-0000000000a4', 1, false,
   '{"name":"Anything Goes",
     "description":"No restrictions. For fun matches — never affects the ladder.",
     "rules":[]}'::jsonb,
   'bootstrap-ag-v1')
  on conflict do nothing;
