# Automatic reporting and optional uploader

## What runs automatically
Addon records duel observations, infers supported outcomes, records item findings, and queues a complete session.
Addon messages go to game clients, not an arbitrary web server. Website upload requires an external helper or user export.
Automatic recording, automatic file flush, outbound upload, and inbound config updates are separate capabilities.

## UX priority — automatic delivery first
v2.2 policy: normal players should not copy/paste results. Automatic delivery through a companion on either participant or a proven relay is the intended experience. Manual reporting below is diagnostic/recovery functionality. First prove these routes using 30_TWO_DEVELOPER_BETA_LAB.md. Retail-style APIs are the working baseline, subject to exact-build tests.

Automatic capture is always on for agreed sessions. Playing, rematching, and local history never require opening the website after each duel. Practice works before account setup. Offer the optional companion at the first visit to Sync, not as a blocking install wizard. All accepted reports have identical rating rules and evidence requirements, regardless of transport.

| Path | Player action | Result |
| --- | --- | --- |
| Companion installed and running | Save results & reload, once between fights or at session end | WoW flushes saved reports; companion uploads complete records; website processes evidence |
| No personal companion, proven signed carrier available | No per-match action | Opponent/relay automatically carries both independently authenticated statements |
| No automatic carrier | Local/practice recording; recovery export in Advanced | Do not promise automatic ranked delivery |
| Addon only, reload only | Reload UI | Saves reports locally; does not contact the website |

Normal WoW behavior is to flush SavedVariables on UI reload as well as clean logout. Verify this on the exact Forever build before enabling the reload sync onboarding claim. Full logout is not the intended routine workflow; if reload fails the beta probe, show the measured fallback and retain copy/paste. Never promise an immediate disk write after each duel.

## Companion flow
One-time setup: select the WoW installation and explicitly approve the addon's file path, pair through the browser, select the app account, then return to play. Suggest likely installation paths without uploading or broadly reading unrelated account data. Multiple installations/accounts need an explicit selection and clear labels. Optional launch at login requires consent.

During play, capture every agreed match automatically. Between fights the addon exposes a quiet Sync panel with a local saved/export queue count and last imported website status. Primary action: **Save results & reload**. Supporting text: **With the companion running, your saved results upload automatically.** An Advanced / Recovery action is **Copy results**; do not present manual export as routine onboarding. Remember the chosen mode; do not re-run onboarding each session.

Reload is player-initiated only. Disable the button during an active duel/series game, combat, unfinished outcome capture, or essential peer exchange. Explain why and re-enable when safe; an idle interval between completed games can be safe once reports and peer delivery are durable. No automatic reloads or repeated confirmation modal for a normal safe click. Retain reports across reload and retry unsent peer messages afterward.

The companion waits for a complete stable file, uploads all eligible records, retries transient errors, and deduplicates repeated saves. The website can show results as they arrive; rating may remain pending until peer evidence arrives. No per-duel upload interaction or mandatory reload after every match. A player may batch an entire fight night.

The addon cannot detect whether the companion is currently running through SavedVariables alone. Selecting companion mode is a preference, not a heartbeat. Never show a live Connected/Uploaded badge based on that preference or on clicking reload. Live upload status belongs in the companion and website.

## Manual diagnostic and recovery flow
**Copy results** opens a selectable export string with focus and Ctrl+C guidance; do not assume WoW can write the operating-system clipboard. Offer a selectable website address rather than assume the addon can launch a browser. Export from memory, include queued losses as well as wins, and do not ask for score transcription.

On the website, Import results is an Advanced / Recovery account action. Paste -> preview account/characters and report count -> Import. Never display or accept a submitted character name as ownership proof. Reuse sign-in; preserve the pasted batch across a sign-in redirect in session-scoped storage with a short expiry, clear it on completion/cancel, and never put it in URLs or analytics. A mismatched account gets an actionable correction, not silent reassignment.

Respect the protocol's 25-report and byte limits. Split large sessions into deterministic numbered batches, remembering progress. After import, show accepted/already received/needs attention counts and individual pending reasons; duplicates are harmless. Offer file import as an advanced fallback with the same size/parser rules. Manual export is an exceptional recovery mode; evidence submitted this way is not inherently less trustworthy, but routine player uploads are not the release UX.

## Returning ratings to the addon
Uploading and downloading are separate. MVP uses an explicit website-generated **Copy addon update** bundle, pasted into the addon's **Import update** field. This can combine report receipts, current ratings, placement progress, and allowed configuration in one action. Refreshing this snapshot is optional for continued practice and does not change server authority.

Server snapshot includes schema version, issued time, generation ID, account-scoped character IDs, ladder/pool/season IDs, ratings, placement progress, and per-report receipt IDs/nonces/digests/statuses. It contains no OAuth tokens or upload credentials. Use a separately tagged, bounded canonical envelope with strict validation; never eval Lua. A corrupt/mismatched bundle leaves the existing snapshot intact. Do not imply an imported snapshot is cryptographically authenticated until an actual signature verifier is implemented and tested. Untrusted imports must never establish ownership, sanction anyone, or alter authoritative rating.

Display **Last known rating · updated [time]**; opening local result history must not fabricate an official post-match delta. Website/companion show current server results. Hide stale local numbers from any decision that requires current eligibility; the server validates that decision. Snapshot generation IDs are opaque and may change after replay, so compare server-issued monotonic snapshot sequence numbers within the same account scope to prevent accidental rollback, not lexicographic generation order. A sequence is freshness metadata, not authenticity proof.

Do not clear evidence merely because the user exported, reloaded, or imported an unsigned receipt. A matching imported receipt may mark a local display as reported, but retain the report under the normal bounded retention policy; display status is not a deletion authorization. Companion has its own server-acknowledged upload ledger. Re-upload is safe.

For MVP, the companion remains read-only with respect to game files. No promise that one reload both uploads a new match and loads its freshly recalculated rating. A later automatic inbound bridge is a separate researched feature; never overwrite loaded SavedVariables or race WoW's saves to make it appear seamless.

## Status language and recovery
Distinguish **Recorded locally**, **Saved for upload**, **Received by website**, **Awaiting opponent**, **Under review**, and **Rated**. Each surface shows only states it can actually know. After startup the addon can recognize previously persisted report IDs; any upload/rating state is explicitly from its last imported snapshot. Do not label a pending match Failed just because the opponent has not synced.

Local counts mean **Not yet acknowledged here**, not a guaranteed number missing from the website. Companion/server acknowledgments can precede the next imported snapshot. Explain that once in the Sync panel, not on every result card.

Companion failures retain the queue and show a single actionable reason: offline (automatic retry), sign-in expired (reconnect), path moved (choose folder), or unreadable file (retry/help). No toast for every successful match and no nags during combat. Provide manual export from every recoverable sync error. Website offers Copy addon update after import and from the player page; server completion does not require copying it back.

No automatic /reload, input injection, memory access, packet interception, hidden IPC, or background modification of running game files.

## Early scope
Small Windows-first optional uploader; select path, browser pairing, status, pause, bandwidth cap, retry, revoke/uninstall. macOS after proof.
Choose mature packaging framework after a file-watch spike; open source and reproducible checksums. Code signing when practical; do not instruct disabling OS protections.
No bonus rating or tactical advantage for installing it.

## Data handling
Allowlist only the addon's selected SavedVariables files. No recursive upload of WTF/account directories.
Parse constrained Lua table data; never eval/load/execute the file.
Debounce, stable-size check, atomic parse, retry incomplete writes, dedupe nonce/digest, resume offsets, handle rotation.
Revocable account-bound reporting credential in OS credential store. Scope permits report submission and reading only its own upload receipts/processing status; no moderation, rules changes, character claims, or identity privileges. The website remains the place for full account management.
Do not write game files while WoW runs. Manual receipt/config import until a documented safe inbound bridge is proven.
Upload success in helper does not instantly update the offline addon.

## Optional disk combat-log experiment
A user-enabled ordinary on-disk combat log may allow continuous evidence upload if supported on Forever. Probe separately from Lua event access.
It may lack contract/winner metadata and cannot be assumed a complete report.
Not a method for reconstructing intentionally hidden data. Use only permitted exposed data, evaluate after combat, no tactical overlay or automation.
Ship only after policy/data/privacy/flush behavior review.

## Evidence origins
Direct website/helper uploads authenticate the enrolled player's report.
Either side may carry a peer record; that alone does not authenticate the peer.
Early lab work must test per-install enrolled report-signing keys so either participant or an opted-in relay can carry both statements. Production promotion requires reviewed crypto, identity enrollment and revocation, complete match/outcome binding, conflict handling and measured runtime cost. Keys can authenticate origin. Keys are extractable and signatures do not prove honest gameplay. No global addon secret.
Until signing is independently reviewed, require each participant's authenticated batch or referee corroboration.
Never punish merely because sync is delayed; missing evidence expires unrated unless a valid adjudication exists.

## Outbox
Preserve unsynced records; warn at size limits and offer export. Stop new ranked capture only if storage is unsafe, not silent deletion.
Compress bounded batches; retry with backoff and pause on metered/slow connections. Honest clients include losses, not a wins-only upload menu.
