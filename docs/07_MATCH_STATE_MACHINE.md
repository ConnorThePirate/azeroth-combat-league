# Independent match states

## Lifecycle
proposed -> accepted -> ready -> armed -> active -> finished.
Pre-start: declined/cancelled/expired.
Active may become interrupted. Resume, evidence-backed forfeit, or void resolves interruption.
Counteroffer clears all acceptances; accepted hash binds roster, mode, rules, best-of, dates and version.

## Evidence
awaiting -> peer_supported -> corroborated | disputed | invalid.
Referee adjudication is separate metadata with actor/evidence/reason.
Missing peer report is not a loss. Single-client allegations never become automatic punishment.

## Rating
ineligible | pending | applied | held | superseded.
Finished/corroborated can be ineligible due to repeat zero weight, custom rules, identity, bracket, same account or mode.
Zero weight is visible valid history. Replay supersedes projections, not raw reports.

## Time policy
Proposal accept_by: 15 minutes.
Start within five minutes after ready, else repeat ready checks.
Default active game timeout: 15 minutes, published in contract.
Disconnect recovery: five minutes; observed game outcome can resolve sooner.
First report: within 72 hours of plausible reported finish.
Peer evidence: within 72 hours after first server receipt.
Appeal: seven days after result; season settlement follows rating spec.
Local time is evidence, not an authoritative clock.
Acceptance expiry is not upload expiry.

## Reconciliation
Validate envelope/auth/size -> roster/contract -> per-game observations and coverage -> determine evidence tier -> append adjudication -> enqueue projection.
No moving a session to another contract hash to split losses/wins.
One series -> one chosen ladder event.
No whole-profile freeze from an allegation. Credible specific evidence can hold an affected result.
Corroborated confirms community evidence standards, not Blizzard server attestation.
