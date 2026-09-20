# Focused testing and operations

## Reference tests
Run: node --test reference/rating.test.mjs.
Covers known deltas, draws, zero weight, seven-day boundary, same-time ordering, alt/Mirror repeat sharing, invalid/same-account exclusion, replay ordering, late void, duplicate receipt, numeric validation, conservation and bounded changes.
This reference is not a production backend or empirical anti-cheat validation.

## Production tests
Unit: canonical bytes/hash, chunk parser, state transitions, item catalog ambiguity, detector coverage, scoring, bracket construction.
Integration: RLS, provider mapping, OAuth state replay, origin authentication, idempotency, generation publication CAS, pairing token scope, private events, adjudication.
End-to-end: practice duel fixture -> batch upload -> corroborated -> ranked -> profile; custom rules -> not globally ranked; event -> bracket.
Client: every affected build/context probe in 04, recording freeze/secret handling, no protected-action errors.

## Adversarial cases
Losing user withholds; one uploader forges second report; both claim win; account/character impersonation; altered contract after acceptance; duplicate/reordered chunks; compressed bomb; duplicate session under new hash; late report/season close; unknown detector mistaken for clean; allowed class heal mistaken for potion; intentional potion to avoid loss; false dispute of champion; alt relink; same-household honest players; raw Lua injection in SavedVariables; uploader credential used for moderation; reconnect after disk rotation.

## Rating simulations before public ranking
Sparse 6/12/30-player groups, Mirror class scarcity, class matchup selection, new strong player convergence, two/three/ten-account collusion rings, 1000-game volume versus diverse opponents, selective late uploads and rollback.
Measure convergence, pair concentration, title eligibility, false sanctions and honest players blocked by limits.
Do not present simulation as proof against collusion.

## Telemetry
Match-stage counts, unknown coverage, upload delay, missing peer rate, detector false positives confirmed by referee, projection age, job retries, DB/storage usage and weekly referee workload.
No raw private reports in product analytics. No mandatory third-party marketing analytics.
Rank duplicate effects = zero allowed.

## Runbooks
Rating bug: pause rating writes, keep evidence intake, snapshot affected inputs, reproduce, fix tests, build inactive generation, compare, publish, explain.
Build break: disable affected detectors, preserve practice, show unknown, retest, release capability config.
Provider outage: local queue persists; no local authoritative rating; resume idempotently.
Identity compromise: revoke device/provider session as applicable, hold specific suspicious reports, verify recovery, replay if necessary.
Volunteer overload: reduce sanctioned events, simplify rules or pause experiment before adding bureaucracy.
