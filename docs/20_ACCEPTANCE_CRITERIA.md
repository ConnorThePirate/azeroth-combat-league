# Release acceptance gates

## Recorder/practice
- [ ] Exact client build recorded; capabilities marked source-only versus tested.
- [ ] Ordinary duel unaffected by addon decline/timeout.
- [ ] Both accept identical immutable rules; custom presets work.
- [ ] Automatic local report and compact result card; no manual score transcription when evidence available.
- [ ] Coverage gaps preserved; no secret-value processing.
- [ ] Session export/import bounded, correct and duplicate-safe.
- [ ] Unsynced records survive normal reload/logout/migrations and storage warnings.

## Identity
- [ ] Battle.net state/redirect/token validation and recovery tested.
- [ ] Provider identity private and stable across reconnect.
- [ ] Character tier accurately reflects claimed/witnessed/official ownership.
- [ ] No fabricated Forever endpoint or local code treated as ownership proof.
- [ ] One user's upload cannot authenticate another participant.

## Ranked beta
- [ ] Community Elo golden/reference/property tests pass.
- [ ] Exactly one chosen ladder event per series; class filter doesn't duplicate rating.
- [ ] Open 10/5 and Mirror 6/3 placements implemented.
- [ ] Pair 100/50/25/0 within rolling seven days across linked alts and Open/Mirror.
- [ ] No zero-weight placement progress; no escrow/RD system from v1.
- [ ] Late evidence/void rebuilds generation atomically with audit.
- [ ] Missing reports/false accusations do not create automatic wins/profile bans.
- [ ] Repeated/confirmed participant violations cannot become free void resets.
- [ ] Disconnected faction/realm pools aren't falsely compared as one calibrated ladder.
- [ ] Zero duplicate rating effects.

## Rules/detectors
- [ ] Category/item exceptions, phase rules, rest and series settings immutable/versioned.
- [ ] Custom change removes Standard eligibility.
- [ ] Allowed class heal vs banned consumable ambiguity tested.
- [ ] External source, pet ownership, secret payload and log gaps represented honestly.
- [ ] Candidate violation needs independent evidence/referee before sanction.

## Automatic delivery and optional personal uploader
- [ ] Two-developer lab report completed; capabilities and failure ledger tied to exact build.
- [ ] Normal supported ranked loop requires no manual copy/paste; one-time pairing/path selection or proven alternate carrier.
- [ ] One-upload/two-origin path verifies both enrolled signatures and rejects tampering/replays; disabled until reviewed.
- [ ] No companion required for practice; no-carrier state is explicit, never falsely shown as synced.
- [ ] Exact beta build demonstrates reload flush; full logout is not required unless a documented probe failure demands fallback.
- [ ] Save results & reload disabled during unsafe capture/combat; no automatic or per-duel forced reload.
- [ ] Reload with no companion never claims website success; addon never invents companion liveness.
- [ ] No-companion in-memory copy/paste completes without reload; long sessions split into bounded numbered batches.
- [ ] Sign-in preserves pasted import temporarily; duplicates and account mismatch have clear recovery.
- [ ] Website update bundle refreshes last-known addon rating; bad/stale imports leave good state intact.
- [ ] Unsigned receipt imports cannot delete evidence or establish identity; report export never discards data.
- [ ] Lost network, stopped helper, moved path, expired credential and delayed peer tested without lost/duplicate results.
- [ ] In observed beta usability sessions, a returning player completes companion batch sync with one safe click, with no routine manual export; recovery export works without retyping scores; measure confusion before adding automation.
- [ ] User-selectable allowlisted file paths, safe data parser, no eval.
- [ ] Real flush latency measured; no claimed instant upload without bridge proof.
- [ ] Scoped credential, pause/revoke, retries/dedupe, rotation/truncation recovery.
- [ ] No input/memory/packet automation or restricted-data workaround.
- [ ] Outbound success does not falsely imply inbound addon refresh.

## Events/community
- [ ] Member can create private/public/unlisted casual event.
- [ ] Registration/check-in/byes/no-show progression/own-case restrictions correct.
- [ ] No-show bracket advancement doesn't invent Elo match.
- [ ] Passport/rivals/fight cards don't change rating.
- [ ] Quiet mode/block/decline work.
- [ ] World/Pit opt-in, domain dedupe and unknown-context exclusions work before scored release.

## Operations
- [ ] Cross-account RLS and private-object access tests pass.
- [ ] Backup/restore and pause-rating work.
- [ ] Quotas bounded; jobs resumable; owner runbook usable.
- [ ] Keyboard/mobile/accessibility pass on core flows.
