# Database model and invariants

PostgreSQL; UTC timestamptz, immutable UUID identities, explicit FK/check/unique constraints and RLS.
This is a schema specification; agent must generate executable migrations and permission tests.

## Identity
profiles(id PK, public_slug UNIQUE, preferences JSONB, status, created_at).
accounts(id PK, profile_id UNIQUE FK, status).
provider_identities(id, account_id FK, issuer, subject_digest, encrypted_provider_metadata, UNIQUE(issuer,subject_digest)); private.
characters(id, account_id FK, product, environment, region, realm_id, readable_guid NULL, class_id, faction_id, level, verification_tier, verified_at).
character_aliases(character_id, realm/name, valid_from, valid_until); no name-only rating reset.
character_verifications(id, character_id, method, witness_id NULL, evidence_ref, status, expires_at NULL).
installations(id, account_id, credential_digest NULL, revoked_at, last_seen); tokens never public.
addon_snapshot_counters(account_id PK, last_sequence BIGINT); atomically allocate increasing safe-integer sequence for website-to-addon exports. Snapshot requests participate in idempotency records; retries reuse the same immutable response. Sequence orders snapshots, not rating generations.
oauth_states(digest, initiating_account, expires_at, used_at); TTL cleanup.

## Configuration
client_builds; capability_tests; feature_flags; detector_catalog_versions; ruleset_versions; seasons; competition_pools; level_brackets; hub_definitions.
Immutable published ruleset content/hash. Season references active policy version and pool scheme.
Capability tests store source-only vs live-tested status distinctly.

## Match
match_contracts(id/session UUID PK, contract_hash, canonical JSONB/bytes digest, season_id, pool_id, ruleset_version_id, rated_intent, ladder NULL, best_of, accepted_expiry).
match_participants(match_id, character_id, account_id_at_match, side); unique match+character and match+side; ordinary duel exactly two enforced at publication.
match_reports(id, match_id, origin_character_id, origin_account_id, installation_id, nonce, body_digest, received_at, auth_method); UNIQUE(origin_account_id,installation_id,nonce).
match_report_revisions append-only with supersedes_id. Duplicate nonce differing digest rejects rather than silently updates.
report_evidence(report_id, bounded facts JSONB, coverage JSONB, private_object_ref NULL).
matches(id FK contract, lifecycle, evidence_state, rating_state, first_seen_at, receipt_seq UNIQUE, finished_at, current_decision_id).
match_games(match_id, game_index, winner_character_id NULL, finish_reason, coverage); UNIQUE(match_id,game_index).
adjudications(id, match_id, result, reason, actor_id, evidence_refs, created_at, supersedes_id NULL); append-only.

## Rating
rating_policies(id, algorithm, immutable configuration).
rating_generations(id, season_id, input_revision, algorithm_version, status, cursor, created_at, completed_at).
season_projection_heads(season_id PK, active_generation_id, input_revision).
rating_ledger(id, generation_id, match_id, ladder_key, participant_character_id, before_milli BIGINT, delta_milli BIGINT, after_milli BIGINT, pair_prior_count, pair_weight, ordinal).
UNIQUE(generation_id,match_id,ladder_key,participant_character_id). Enforce after=before+delta and paired deltas sum zero within committed event.
ladder_members(generation_id, ladder_key, character_id, rating_milli, positive_series, distinct_opponents, last_activity); UNIQUE(generation_id,ladder_key,character_id).
Pair authority: eligible match event rows + immutable account snapshots/time. Daily aggregates are optional cache, never exact seven-day source.
No rating_escrow/RD/volatility tables in v2.

## Events/community
tournaments, event_staff, registrations, entrant_members, check_ins, bracket_nodes, event_matches, rules_acceptances, announcements.
optimistic lock_version for event/bracket changes.
world_opt_ins, world_sessions, kill_reports, kill_decisions, score_ledger, pit_lives, horns, sightings, crowns.
One kill source cannot score both War and Pit; unique score_source/domain constraint enforced transactionally.
rivalries/passport/achievements are derived non-rating projections.

## Integrity/operations
disputes, evidence_attachments, moderation_actions, sanctions, appeals, audit_events, idempotency_records, jobs.
No client writes to ledger, decisions, roles, provider identity or capability approval.
Moderator permissions scoped; own-case ruling prohibited except documented emergency owner action with later review.

## RLS
Public: published sanitized profiles/matches/rules/events and active projection.
Owner: own preferences, claims, report status and dispute submissions.
Organizer/referee: assigned event operations through functions.
Service: only trusted backend functions/jobs.
Private events: membership ACL, not merely an unguessable URL.

## Retention
Permanent while service operates: rating inputs, contract/result/adjudication history and replay-relevant policy versions.
Verbose evidence 90 days unless disputed; cases retain evidence until resolved plus 90 days.
Live hub presence minutes; expired horn/sighting content 24 hours.
Deletion pseudonymizes public identities and preserves minimal replay inputs as disclosed. Remove credentials/private optional content.
Budget actual row/index sizes; never retain unlimited raw event logs in 500 MB database.
