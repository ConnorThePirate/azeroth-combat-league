# Two-developer beta lab and automatic sync release gate

## Product decision — v2.2
Assume Forever uses the retail-style addon sandbox and APIs as the implementation baseline. This is a working assumption, not live verification or a promise that every retail function exists. Detect build and capability differences; preserve the restricted-data boundaries. No arbitrary HTTP, sockets, or general file writes from addon Lua are assumed.

Automatic delivery is the normal product requirement. Routine copy/paste reporting is not an acceptable public ranked experience. Manual export/import is for developer diagnostics, recovery, and exceptional unsupported setups only. This supersedes earlier v2.1 language describing manual upload as an equal primary onboarding path. The companion is optional for an individual only if another enrolled participant or available relay can reliably carry their authenticated report. If no automatic carrier exists, show Local/practice recording; do not misleadingly advertise automatic ranked submission.

First users are the owner and co-developer. Deliver a runnable test kit before investing in a polished production transport. Website work can proceed against fixtures. The agent must implement tests and record unknowns; it cannot perform the two humans' live-client experiments itself.

## Initial deliverables
1. Instrumented Lua probe addon with a Test Lab panel, build/capability summary, scenario checklist, bounded diagnostics, automatic journal, and crash-safe pending outbox.
2. Windows companion prototype: explicit path consent, safe SavedVariables parser, allowlisted log tailer behind a lab toggle, local spool, automatic upload/retry, live status, and session health summary. No game-memory access or game input automation.
3. Local or low-cost hosted test backend with two separate accounts, device enrollment/revocation, ingestion, receipt status, reconciliation, shadow rating, and fixture download. Secrets stay out of addon logs.
4. Lab dashboard correlating each tester's observations, file arrival, server receipt, mismatch and rating state by session ID. Automatically assemble the test report; testers should not transcribe match outcomes into forms.
5. Proven crypto candidates and timing fixtures. Separately assess a vetted Lua-capable public-key signature implementation and companion-assisted enrollment. Never invent cryptography to meet a deadline. If viable key protection or runtime performance is insufficient, record the limitation rather than claiming two signed origins.

## Two-person setup
Tester A and B use independent game accounts and independent app identities on separate machines. Start same faction/realm with an ordinary duel. Swap winner and uploader roles. Later use eligible alternate characters for cross-faction and level-context tests; report blocked scenarios when characters or access are unavailable. Do not count a fixture as a live pass.

Record exact client build, addon/companion version, OS, installation path category, faction, realm, readable character identity, group state, zone and allowed context. Keep personal paths/account identifiers private and redact shared diagnostics.

## Experiment matrix
| Area | Controlled experiments | Required observation |
| --- | --- | --- |
| Duel lifecycle | Normal wins by both sides, surrender, bounds, interrupt, disconnect, draw/timeout if supported | Start/end signals and winner evidence; distinguish no outcome from loss |
| Rules | Allowed class healing; known potion, bandage, trinket, engineering effects; pets and outsider interference | Readable IDs, phase/source attribution, gaps and false positives |
| Restricted contexts | Before/during/after combat and relevant instances | Which calls/messages are allowed; never inspect or serialize secret values |
| Peer transport | Whisper/party and supported channels; same/cross faction; group changes, reloads, recipient offline | Sender binding, byte/throttle limits, acknowledgment, replay/dedupe, queue recovery |
| Signed statements | Enroll both, agree contract, exchange result receipts, carry B's receipt through A | Server verifies two distinct enrolled origins from one upload, not two bodies attributed by A |
| SavedVariables | Duel end with no action, manual reload, logout, clean exit, forced process termination | Actual write timing, truncation/rotation, recoverable reports; no assumption of duel-end flush |
| Disk logs | Enable only ordinary supported logging with consent; inspect write/flush latency and available fields | Whether logs expose useful evidence without reload; whether complete match/contract linkage is possible |
| Logged addon messages | Inspect supported behavior of SendAddonMessageLogged using innocuous test payloads | Whether payload is present in an accessible local file at all; logged does not mean local disk |
| Single uploader | B companion absent, A running; then reverse; then stop A before receipt | Which signed reports survive and who can deliver after reconnect |
| Third-party relay | Separately enrolled, human-operated organizer when a third endpoint is available | Authentic participant receipts relayed unchanged; availability/faction/context limits |
| Delivery failure | Offline network, server 429/5xx, expired/revoked credential, duplicate/reordered batches | Durable spool, bounded retries, no duplicate effects or wrong-account upload |
| Tampering | Alter winner/rules/nonce, forge body sender, reuse signature, revoke key, submit conflicting signed result | Correct rejection/quarantine; authenticated malicious statements still not treated as gameplay proof |
| Rating return | Companion/browser server status, approved peer-delivered signed snapshot if feasible, safe closed-client import experiment | What can update in-game without user action, how old it is, and what remains unsupported |
| Load and UX | Back-to-back duels, both full addons and competing chat traffic, long session, reconnect | Frame impact, lost messages, queue growth, player actions and confusing status text |

Two humans cannot independently validate a three-person witness scenario without another endpoint/tester. Mark relay runtime pending until available; simulated relay routing is only a fixture test. Never substitute an unattended gameplay bot for the third participant.

## Evidence and test execution
Run a minimal smoke pass first to eliminate impossible transports. For surviving routes, run at least 10 repeats of each key delivery/recovery case, swapping A/B; expand outcome/rules cases per docs/02 (30 controlled cases per critical family, 100 varied series before ranked review). These counts are engineering gates, not proof of perfect reliability.

Log local monotonic durations and server receive times separately; do not calculate one-way latency by subtracting unsynchronized wall clocks. Track end-of-duel -> local complete report -> file availability -> server receipt -> corroboration -> rating commit, with unknown stages explicitly missing. Publish sample count, median/p95 where meaningful, maximum, loss/retry counts and human actions. Online stable-session design target is zero per-match player actions; if a live bridge exists, target p95 receipt within 15 seconds after complete reports are available, then revise based on measurements. Do not claim this target is met before testing.

Each test stores expected outcome, actual result, build/context, permitted redacted trace, tester, repeat count, capability status and reproduction steps. Test Lab emits an automatic session bundle through the companion; manual export is available if the bridge itself fails. A failure ledger records impact, recovery, owner and retest status.

## Transport selection after experiments
Preferred: permitted low-latency file/log transport plus companion, complete signed participant evidence, automatic retries. Raw combat logs alone cannot stand in for authenticated match agreement/outcome.

Fallback: SavedVariables plus companion, one voluntary safe reload between fights or at session end. No per-match reload requirement. Describe this as automatic upload after save, not real-time sync. If this is the best supported route, review the measured UX with the two developers before public ranked release.

Coverage improvement: either participant can carry both reviewed, independently enrolled signatures; opted-in community relays may carry the same package. The relay supplies transport, not independent gameplay corroboration. No shared signing secret, forged second origin, or elevated trust merely for using a companion.

If signatures are not ready, each participant needs their own authenticated automatic submission, or a legitimate referee ruling. A single uncorroborated report never becomes a ranked win just because its opponent stays silent. If no permitted automatic route works, keep the recording/practice build useful and pause public ranked release rather than turn routine manual imports into the product.

## Inbound rating freshness
Website and companion can always display the latest backend result when online. An addon snapshot is dated until a proven inbound route exists. Investigate server-signed snapshots carried by a legitimate in-game peer whose client has actually received them, but do not assume the first peer has an internet bridge. Test signature verification, origin, replay, stale generation and account scope.

A separate companion experiment may stage public snapshot data only after the selected game client is fully closed, with explicit consent, backups and next-login verification. It is not a live bridge and does not justify overwriting active SavedVariables. This is disabled by default and outside the read-only production MVP until separately approved in the design review. No automatic second reload, fake instant refresh, browser automation, screen encoding, or restricted-data workaround.

## Exit report and decision
Deliver supported/partial/failed/unknown matrix, selected primary/fallback transport, setup instructions, measured UX, known missing evidence, automatic delivery coverage and next-build fixes. Keep raw records private and attach shareable redacted fixtures.
Public ranked release requires reliable automatic reporting for its advertised supported setups, independent origin verification, durable recovery, server idempotency, clearly dated in-game ratings, and working restrictions-aware outcome detection. Require both developers to complete the normal loop without copy/pasting results. Practice and website features may ship earlier.
