# Releases, seasons, and flags

Release milestones and level caps are separate configuration. Do not assume the platform can be built before a particular beta cap increase.

## Releases
R0: two-developer probe lab, companion prototype, test backend, signed-receipt experiments, recorder, practice contracts, web shell.
R1: identity, automatic local results, rules editor, independent evidence, shadow ratings, profiles.
R2: community ranked beta, class boards, local hub board, first fight night, automatic delivery for advertised supported setups after bridge proof; no routine manual upload requirement.
R3: public/private tournaments, community features, supervised Gurubashi/world events.
R4: individually promoted persistent Pit/world/native-team modes.

## Flags
same_faction_contracts, duel_outcome_inference, combat_log_capture, item_detection, cross_faction_contracts, savedvariables_uploader, disk_log_upload, signed_peer_receipts, report_relay, inbound_rating_bridge, hub_board, world_events, world_score, pit_score, native_teams, team_rating.
Each has build, contexts, evidence fixture, last-tested date, owner, and fallback. Unknown defaults off.
Partial failure blocks that capability only.

## Probe gates
Test each duel termination and detector context separately. Record false positives, false negatives, and missing coverage.
Start with 30 controlled cases per critical outcome/violation family and 100 varied community series before ranked review. These are review milestones, not statistical guarantees.
No live tests have been performed by the document author.

## Seasons
Configure cap 20, 30, and later milestones. Archive cap seasons without carrying rank. Lower-level cups stay available without creating empty permanent ladders.
Routine builds require retesting, not automatic season reset. Material balance/rules changes require an explicit policy decision.

## Offline behavior
Server can pause rating immediately; it cannot disable an offline addon instantly.
Imported config expires after seven days; stale clients can practice but cannot label new contracts officially ranked.
Show rating/pair allowance as dated estimates. Emergency server suspensions use a published effective time and explicit rejection reason.
