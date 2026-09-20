# WoW Forever Community PvP Platform — revised master plan v2.2

Working title: Azeroth Combat League. Free player-run community project.

This consolidated plan supersedes the prior Glicko/escrow blueprint. Its coding-agent handoff is wow-forever-pvp-handoff.zip (v2.2 content), with 36 Markdown files and a runnable rating reference. Read README.md and CODING_AGENT_START.md after extraction.

Key decisions: Battle.net linking with separate character verification; automatic local recording and optional read-only uploader; exact Community Elo; configurable rules and permitted combat-log detection; optional local queues; community events and independent world/Pit standings. No live client or authenticated Forever ownership test was performed during this revision.

The following subsystem specifications are the same content as the handoff package. Executable reference files are in the archive. Relative document filenames below refer to its docs directory.

Sync UX revision: automatic delivery is the intended normal experience; manual exports are diagnostics/recovery only. First deliver the two-developer test lab in docs/30, assuming retail-style APIs and verifying exact-build behavior, signed peer receipts, file/log bridges and failure recovery.

## Product requirements

### Player loop
Install -> challenge -> accept familiar rules -> fight -> automatic result card -> rematch.
Use captured evidence instead of asking players to retype scores. One session sync is the fallback.

### Modes
- Open 1v1: any class, Standard rules, active level bracket.
- Open-by-Class: same Open rating filtered by class.
- Mirror: independent same-class rating; select Open or Mirror before combat, never double-score.
- Custom duels: configurable items/rules, recorded history, unrated globally.
- Optional hubs: outside Stormwind, Orgrimmar, and capability-gated Gurubashi.
- Public/private/unlisted tournaments: website builder and small in-game action surface.
- World/Pit: opt-in activity journals, scheduled events, then evidence-gated scores.
- Native 2s/3s/5s: conditional adapters. Existing unranked queue may produce unequal ranks; do not manipulate it.

### Community priorities
Fast rematch; rookie/class nights; rivalry pages; personal bests; passport; opt-in sharing; accessible event templates; quiet mode.
No daily chores, penalty for declining, paid progression, or global queue requirement.
Practice works without Battle.net enrollment. Ranked beta requires linked account and witnessed/provider-verified character.

### Success
Measure time-to-fight, sync completion, returning players, available unique opponents, referee workload, and player enjoyment/confusion.
No invented startup conversion goals.
Zero duplicate rating effects is an invariant.

### Non-goals
Anti-cheat guarantees; exact hostile tracking; arbitrary HTTP from Lua; guaranteed live sync without a proven bridge; hidden-state reconstruction; gold/cash wagering; a separate permanent ladder for every custom preset.

## Releases, seasons, and flags

Release milestones and level caps are separate configuration. Do not assume the platform can be built before a particular beta cap increase.

### Releases
R0: two-developer probe lab, companion prototype, test backend, signed-receipt experiments, recorder, practice contracts, web shell.
R1: identity, automatic local results, rules editor, independent evidence, shadow ratings, profiles.
R2: community ranked beta, class boards, local hub board, first fight night, automatic delivery for advertised supported setups after bridge proof; no routine manual upload requirement.
R3: public/private tournaments, community features, supervised Gurubashi/world events.
R4: individually promoted persistent Pit/world/native-team modes.

### Flags
same_faction_contracts, duel_outcome_inference, combat_log_capture, item_detection, cross_faction_contracts, savedvariables_uploader, disk_log_upload, signed_peer_receipts, report_relay, inbound_rating_bridge, hub_board, world_events, world_score, pit_score, native_teams, team_rating.
Each has build, contexts, evidence fixture, last-tested date, owner, and fallback. Unknown defaults off.
Partial failure blocks that capability only.

### Probe gates
Test each duel termination and detector context separately. Record false positives, false negatives, and missing coverage.
Start with 30 controlled cases per critical outcome/violation family and 100 varied community series before ranked review. These are review milestones, not statistical guarantees.
No live tests have been performed by the document author.

### Seasons
Configure cap 20, 30, and later milestones. Archive cap seasons without carrying rank. Lower-level cups stay available without creating empty permanent ladders.
Routine builds require retesting, not automatic season reset. Material balance/rules changes require an explicit policy decision.

### Offline behavior
Server can pause rating immediately; it cannot disable an offline addon instantly.
Imported config expires after seven days; stale clients can practice but cannot label new contracts officially ranked.
Show rating/pair allowance as dated estimates. Emergency server suspensions use a published effective time and explicit rejection reason.

## User flows

### Onboarding
Install and practice immediately. On website: create app session, Connect Battle.net on Blizzard's own page, claim character, verify through supported ownership API or volunteer witness.
Import public identity/config bundle, never OAuth tokens.
Optional uploader pairs a revocable upload-only credential and user-selected file path.

### Duel
Target -> Challenge -> Standard/custom preset -> review differences/coverage -> both accept hash -> ordinary duel -> automatic capture -> compact result card -> Rematch.
Ordinary /duel may offer ranked upgrade only before combat. Decline/timeout never obstructs normal dueling.
Remember presets, never auto-accept changed terms.
Result card offers Confirm, Report problem, Rematch. Full questionnaire is unnecessary.

### Reporting
Addon records automatically, including losses.
Helper uploads when complete records reach permitted disk files; exact timing is measured, not promised.
With helper, Save results & reload flushes a batch when safe; helper sends it. Reload alone does not upload. Do not force reload after each duel.
Without a personal helper, prefer a proven opponent/relay carrier of both signed receipts. If none is available, show local/practice state. Copy results -> website import remains an Advanced recovery route, not normal reporting.
Website Copy addon update -> addon Import update optionally refreshes last-known rating and receipt display. Upload success does not automatically refresh in-game rating. See 27_AUTOMATIC_RECORDING_AND_UPLOADER.md for authoritative sync UX and failure handling.
A player may transport peer observations, but cannot authenticate the peer just by uploading their name/hash. Independent app/helper attestation or referee evidence is required.

### Missing evidence
Await counterpart for 72 hours after first receipt. Notify privately. No automatic win and no whole-profile suspension from an allegation.
Repeated demonstrated abandonment can limit ranked entry after review. A disconnect before adequate evidence can leave a match unresolved.

### Hubs
Local opt-in only, five-minute expiry, visible/targetable opponent check, rally leader and manual layer label.
No forced layer changes, remote/global queue, or decline penalty.

### Events
Website creates event and authoritative bracket. Addon shows the imported or permitted peer-updated next action with timestamp.
Private/custom events do not need a reputation grind. Sanctioned rating requires rules/evidence eligibility.

### World/Pit
Explicit opt-in and session enrollment. Unknown solo/group context remains unknown.
Opt-out stops local recording immediately; website intelligence stops when the website receives it.

## API evidence and live probe plan

### Working assumption
Use the retail-style addon system as the development baseline at the user's direction. Exact Forever behavior must be measured. Execute 30_TWO_DEVELOPER_BETA_LAB.md with the owner and co-developer; absence of a live result is unknown, not pass.

### Proven source versus untested runtime
Re-inspected local Gethe/wow-ui-source snapshot:
commit 70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e, build 1.60.1 (69913), dated 2026-09-18.
This is the snapshot available for review, not a claim that no newer beta exists.
No game client, player credentials, authenticated character API, or live network transport was tested here.

### Source findings
| File under Interface/AddOns/Blizzard_APIDocumentationGenerated | Finding | Implication |
|---|---|---|
| DuelInfoDocumentation.lua | DUEL_REQUESTED carries playerName; DUEL_FINISHED has no winner payload | test actual start/outcome signals; finish alone is insufficient |
| CombatLogDocumentation.lua | COMBAT_LOG_EVENT/UNFILTERED have HasRestrictions=true; IsCombatLogRestricted exposed | build restriction-aware adapter, not guaranteed full combat logs |
| ChatInfoDocumentation.lua | SendAddonMessage sends to other clients; SecretArguments=NotAllowed; InChatMessagingLockdown exposed | no arbitrary web upload; defer protected sends |
| UnitDocumentation.lua | PARTY_KILL GUID payload has SecretWhenUnitIdentityRestricted | world attribution conditional |
| UnitAuraDocumentation.lua | several accesses have aura/secret restrictions | buff/effect monitoring conditional |
| PvpInfoDocumentation.lua | match/score interfaces present in prior snapshot audit | probe live native modes before team ranking |

Other prior observations: PvPMatch UI allows standard/camelot while standard queue UI excludes camelot. Map/NPC names such as Hyjal Crater/Mak'gora do not prove an accessible queue.
Source links pinned in 23_SOURCES.md.

### Probe matrix
- Duel request/start/countdown/end for win, surrender, bounds, death, disconnect and interruption; determine winner without relying on health alone.
- Same-faction whisper/party transports before/during/after combat; sender identity, byte limits, throttles, restriction return values.
- Cross-faction Gurubashi with/without groups; do not infer success from same-faction tests.
- Combat event payload readability by unit/context; restriction state transitions; spell/item IDs and pet ownership.
- Controlled potions, engineering, bandages, allowed class heal, trinkets, external buff/heal/damage, triggered effects.
- Pre-Ready/between-game/active timing; inspect cache/range/equipment changes.
- Self/map/area boundary and layer ambiguity.
- World kills solo/group/raid, gray levels, outsider assistance, victim identity.
- Any live instanced mode: start/end, roster, winner/score completeness.
- SavedVariables flush: duel end, manual reload, logout, quit, crash; disk log behavior separately.
- Battle.net login and documented Forever ownership support after app registration.

### Records
capability, build, context, status (observed_source / tested_pass / partial / fail / unknown), timestamp, sample count, false-positive/negative examples, coverage gaps, fixture path, tester.
Production flags require tested evidence. Do not use pcall as permission to operate on secret values.
Official API absence or access restriction blocks that detector only. Website/custom/practice functionality continues.

## Addon architecture

### Layout
Bootstrap.lua; Core/{Events,State,Capabilities,Diagnostics}; Domain/{Contract,Series,Rules,Identity};
Adapters/{Duel,CombatLog,Aura,Inspect,Map,PvPMatch}; Comms/{Codec,Transport,Reliability};
Sync/{Outbox,Export,Import}; UI/{Challenge,Result,RulesEditor,History,Hub,Event,Settings}; Locale; Tests.

### Flow
One event dispatcher -> readable normalized facts -> bounded domain state -> UI presentation.
Adapters isolate Blizzard-specific API differences. No protected gameplay actions, high-frequency enemy scans, or secret-value coercion.
Record observations where permitted; defer interpretation/sync until after combat if required.
Outcome inference is versioned and evidence-backed; no winner inferred just because target health is low.

### SavedVariables
schemaVersion, installationId, settings, publicIdentityBundle, capabilities, contracts, reports, outbox, receipts, diagnostics.
Installation ID isn't proof of a person. Never store OAuth/access/service credentials.
Keep 100 acknowledged completed reports by default; unsynced records are preserved beyond that threshold with storage warning/export.
Bound diagnostics to 500 redacted entries.
Migrations preserve prior schema backup and do not erase unsynced evidence.

### UI
Challenge, Matches, Rules, Hub, Events, Sync, Settings.
Compact combat display: static contract/series score and permitted timer only.
Post-match card: outcome, monitoring coverage, flagged issue, Confirm/Report problem/Rematch.
Remember presets, show changes, require mutual consent.
Quiet mode suppresses unsolicited hub/event notifications.

### Hub and event data
Hub presence uses tested local addon transport and short expiry; not website-driven live global matchmaking.
Layer labels are player-provided/visibility-tested; no invented layer API.
Event/rating website data is imported snapshot unless a safe supported update route is demonstrated.

### Build
Correct .toc interface value from actual client, not guessed from build number.
Separate addon semver, schema major and detector catalog version.
Release ZIP contains one addon folder; exclude probes, tests, secrets and debug dumps.

## Protocol v2 and sync

Schema IDs: wf.match-contract.v2, wf.match-report.v2, wf.sync-envelope.v2.
Addon prefix WFCPVP2. Major versions must match; optional minor capabilities are negotiated.
Hash/checksum means integrity of bytes, NOT identity or game truth.

### Canonical bytes
Restricted JSON: ASCII object keys sorted lexically, UTF-8 string values preserved exactly, no Unicode normalization transformations, integers in safe range only, arrays ordered, booleans/null standard, no whitespace, duplicate object keys rejected.
Use a specified JSON string escaping implementation shared by golden fixtures. Names are display values; UUIDs/GUIDs are identity.
Compute SHA-256 of canonical bytes with reviewed libraries. No ad-hoc substitute hash.
Do not include display strings that each client independently localizes in the contract hash.
Round timestamps to integer milliseconds before serialization; never hash floats.

### Contract example
The following is valid structural data; IDs must resolve to real server-issued config in production.

    {
      "schema": "wf.match-contract.v2",
      "sessionId": "11111111-1111-4111-8111-111111111111",
      "seasonId": "22222222-2222-4222-8222-222222222222",
      "poolId": "33333333-3333-4333-8333-333333333333",
      "ladder": "open",
      "ratedIntent": true,
      "bestOf": 3,
      "rulesetVersionId": "44444444-4444-4444-8444-444444444444",
      "participants": [
        {"characterId":"55555555-5555-4555-8555-555555555555","side":1},
        {"characterId":"66666666-6666-4666-8666-666666666666","side":2}
      ],
      "levelMin":20,
      "levelMax":20,
      "venue":{"kind":"anywhere","mapId":null,"areaId":null},
      "tournamentMatchId":null,
      "createdAtMs":1789833600000,
      "acceptByMs":1789834500000,
      "configVersion":"beta-v2"
    }

Ordinary duel requires exactly two distinct characters, distinct sides, resolvable ruleset/season/pool, bestOf in [1,3,5], exact bracket, and no same-account ranked pairing.
Tournament is metadata, not a mutually exclusive ladder type. Custom rules use ladder=null/ratedIntent=false.
Session UUID is only a collision identifier, not a secure nonce/auth credential. Server issues security-sensitive tokens.

### Messages
HELLO: version, build, capabilities, session nonce.
OFFER/COUNTER: full proposed contract.
ACCEPT: contract hash and sender slot.
READY: readiness and readable checks/coverage.
OBSERVATIONS/FINISH: bounded post-combat report facts.
CONFIRM: exact outcome/contract attestation.
CANCEL, ACK, NACK: administrative control.
Never require in-combat delivery. START is a local observation, not a mandatory combat-time network message.

### Transport defaults to prove
200-byte maximum frame including header; lower further if live client testing requires.
Header fields: major, session short ID, message ID, sequence, chunk index/total, payload checksum. Chunk data printable base64url.
Maximum logical peer message 16 KiB, <=256 chunks, <=4 concurrent assemblies per sender. Assembly expires after 30 seconds with no progress or 180 seconds total; this allows a full payload at the default throttle.
Initial token bucket 4 frames/second, burst 8; obey actual client throttle/error status.
ACK complete message; after the last frame, retry missing-frame requests at 2/5/10 seconds only out of lockdown. Resend missing chunks rather than the whole message; then retain outbox and show status. Never interleave enough bulk reports to starve a contract/control frame.
Validate actual sender from game event against expected participant; body sender field alone is not trusted.
Deduplicate message ID+digest. Same ID/different digest rejects. ACK messages are not ACKed.
Do not broadcast full reports to general chat/custom public channels.

### Reports
Required: schema, sessionId, contractHash, originCharacterId, installationId, nonce, build, addonVersion, detectorCatalogVersion, lifecycle times, games[], coverage[], attestations[], peerDigests[].
Each game: index, observed start/end, claimed winner character or null, finish reason, evidence facts and interference/violation candidates.
Attestation references exact contract/outcome digest; report revisions append and supersede, never overwrite.
Pending reports may lack winner; they are evidence only and cannot rate.
Origin authentication comes from app/helper session or separately reviewed enrolled signature, not copied JSON.

### Export
WFP2:<base64url(raw-DEFLATE(canonical-json))>:<eight-hex-CRC32>
Choose raw DEFLATE only, no codec guessing. CRC is corruption detection, SHA-256 links content, neither authenticates a player.
Envelope decoded max 256 KiB; compressed max 128 KiB; max 25 reports. Reject excessive depth (>16), overlong strings (>4096 bytes except explicitly bounded payload), duplicate JSON keys, or decompression over limit.
Batch parsing yields per-item accepted/duplicate/rejected/awaiting results; malformed envelope fails wholly.
SavedVariables is parsed as data, never executed.

### Website-to-addon snapshot
Schema wf.addon-update.v1; envelope WFU1:<base64url(raw-DEFLATE(canonical-json))>:<eight-hex-CRC32>. Same 128 KiB compressed/256 KiB decoded, depth and string limits as report export; distinct tag prevents importing results as config.
Required: accountId, snapshotSequence (positive safe integer), issuedAtMs, schema, characters[], receipts[], configVersion. Character entries include characterId and ladder snapshots with seasonId/poolId/ladder/ratingMilli/placement progress/generationId. Receipt entries identify installationId, nonce, bodyDigest, receiptId and processing status. Limit to 25 receipts per bundle and 100 ladder snapshots; page receipts using the website cursor and one newly issued sequence per bundle. Show remaining pages, allow optional later import, and upsert only included records; absence never deletes or resets a rating/receipt.
Server allocates account-scoped monotonic sequence atomically and reads rating rows from each season's committed generation. Addon rejects unsupported schema, account mismatch, malformed fields and older/equal sequence (equal can report Already imported). A newer page must not erase earlier pages. Export no secrets. Imported data is a last-known display snapshot, not authoritative eligibility or ownership proof; CRC/hash is not authentication. See docs/27 for retention and trust limits.

### Server behavior
Deduplicate account+installation+report nonce; conflicting reuse rejects.
First accepted report assigns first_seen_at/receipt_seq. Contract hash never replaces session identity; conflicting hashes for same session are quarantined together.
Acceptance expiry applies to acceptance/start, not later upload. Upload clocks follow 07.
Server receipts/config are authenticated by app TLS; imported config trust must not be described as cryptographic unless a real verified signature exists. Keep ranked authority on server.
Cross-faction fallback uses website session enrollment/referee when direct comms fail. Six-character code is only a rate-limited rendezvous hint, never authorization.

## Independent match states

### Lifecycle
proposed -> accepted -> ready -> armed -> active -> finished.
Pre-start: declined/cancelled/expired.
Active may become interrupted. Resume, evidence-backed forfeit, or void resolves interruption.
Counteroffer clears all acceptances; accepted hash binds roster, mode, rules, best-of, dates and version.

### Evidence
awaiting -> peer_supported -> corroborated | disputed | invalid.
Referee adjudication is separate metadata with actor/evidence/reason.
Missing peer report is not a loss. Single-client allegations never become automatic punishment.

### Rating
ineligible | pending | applied | held | superseded.
Finished/corroborated can be ineligible due to repeat zero weight, custom rules, identity, bracket, same account or mode.
Zero weight is visible valid history. Replay supersedes projections, not raw reports.

### Time policy
Proposal accept_by: 15 minutes.
Start within five minutes after ready, else repeat ready checks.
Default active game timeout: 15 minutes, published in contract.
Disconnect recovery: five minutes; observed game outcome can resolve sooner.
First report: within 72 hours of plausible reported finish.
Peer evidence: within 72 hours after first server receipt.
Appeal: seven days after result; season settlement follows rating spec.
Local time is evidence, not an authoritative clock.
Acceptance expiry is not upload expiry.

### Reconciliation
Validate envelope/auth/size -> roster/contract -> per-game observations and coverage -> determine evidence tier -> append adjudication -> enqueue projection.
No moving a session to another contract hash to split losses/wins.
One series -> one chosen ladder event.
No whole-profile freeze from an allegation. Credible specific evidence can hold an affected result.
Corroborated confirms community evidence standards, not Blizzard server attestation.

## Configurable rulesets

Create, save, share and choose presets in addon and website. Common presets are quick; advanced controls remain available. A capable agent should implement the builder, not only a fixed ban list.

### Templates
Ranked Standard: class abilities/self buffs and bandages allowed. Active-game potions, elixirs, flasks, world/external buffs and activated engineering prohibited. Class-created items require an explicit tested allowlist; unknown classification is attested/unavailable.
Pure Duel: class-only; no optional consumables or bandages.
Fieldcraft: declared consumables/engineering allowed.
Anything Goes: normal tools, no exploits or outside participants.
Custom: private/event settings including void-on-violation if desired.
Only the exact approved immutable Standard version rates globally. Custom events get their own standings, not a new global Elo ladder.

### Controls
Allow/deny category, item ID overrides, permitted effect IDs, quantity per game, buff source, equipment swap policy, activated gear, engineering, class-created items, pets, food/drink, rest time, game timeout, best-of, interference/disconnect rules.
No user-supplied executable Lua.
Precedence: item exception > category > template.
Distinguish equipped/possessed/used/received-effect restrictions. Unknown does not mean banned.

### Phase definitions
Preparation: normal food/drink allowed. Remove prohibited persistent buffs before Ready.
Ready: allowed gear/buff snapshot; policy-relevant changes clear readiness.
Active: apply active-game bans/counts.
Between games: normal food/drink/bandage allowed in Standard; no world/external buffs. Default rest 120 seconds; mutually extend up to five minutes. No claim of resetting cooldowns.
Series end: evidence review/result card.
Long cooldowns remain the game's mechanics. Tournament changes to rest/gear rules require pre-event publication.

### Detection and coverage
Observable: a tested detector can see relevant data in this context; not anti-cheat.
Corroborated: independent observations/referee support conclusion.
Attested: players confirm.
Unavailable: cannot evaluate now.
Coverage is recorded per rule, game, client and time interval.
No observed violation is not proof of a clean game.

### Consequences
Confirmed participant violation: default game loss, serious/repeated violations may disqualify series.
Unknown/ambiguous: review or attested result, no automatic loss.
Unavoidable outsider interference: restart/void affected game.
Coordinated interference: staff investigation.
Casual custom void-on-violation is permitted but clearly inappropriate for Standard ranked: a losing player must not escape by deliberately breaking a rule.
Never automatically forfeit from one editable client's claim.

### Rule schema
rule_id, ruleset_version, category, action (allow/deny/limit), item_ids, effect_ids, phase, count_limit, source_filter, detector_id/version, minimum_evidence, unavailable_behavior, sanction.
All published rulesets immutable and hash-addressed. Edits create versions and reset acceptance.
Before duel show preset differences and coverage. After duel show observed source/effect/time, rule, evidence origins and decision.
See 28_COMBAT_LOG_DETECTION.md.

## Community Elo v1 — exact specification

Algorithm ID: community-elo-1. Replaces the incomplete Glicko/escrow proposal. Priorities: understandable changes, symmetric repeat weighting, simple replay, and a volunteer-friendly system. No RD, volatility, conservative-score sort, or gain-only escrow.

### Rating populations
Key: season + competition pool + level bracket + ladder + character.
Pool is a configured connected region/realm/faction population. At same-faction-only launch, maintain faction pools; a combined directory is not a calibrated cross-faction ranking.
Open: Standard any-class.
Open-by-Class: filtered Open, no extra update.
Mirror: independent same-class ladder. Contract selects Open or Mirror; never both.
Tournaments affect these ratings only if sanctioned and use identical eligibility/pair rules.
No class, gear, venue, win-margin, or best-of-length modifier.
Future cross-faction pool starts at a season boundary after connectivity is proven.

### Numerical representation
Initial rating 1500.000, stored as integer milli-rating 1500000.
No floor/ceiling or hidden rating. Display nearest integer, ties away from zero.
Rank established active players by internal rating descending. Equal values share displayed rank; UUID provides stable visual order only.
Canonical A/B order is character UUID lexical order, not winner or uploader.

### Exact update
RA/RB are ordinary rating points.
Expected A: E = 1 / (1 + 10^((RB - RA) / 400)).
S = 1 A win, 0 A loss, 0.5 permitted corroborated draw.
K = 32 for all players, placements included.
w = 1, 0.5, 0.25, or 0 from pair policy.
deltaMilli = roundTiesAwayFromZero(32000 * w * (S - E)).
newA = oldA + deltaMilli; newB = oldB - deltaMilli.
Calculate once from both pre-match ratings. Zero weight returns unchanged immediately.
Clamp exponent input to [-16,16] for numeric stability at extreme values.
Pin runtime/algorithm; all implementations must pass cross-runtime fixtures. If floating rounding differs, adopt a reviewed deterministic implementation, not arbitrary tolerance in stored ledger.
Reference implementation and tests: reference/rating.mjs and reference/rating.test.mjs.

### Repeat policy
Counter key: season + canonical unordered linked-account pair, across all characters and Open/Mirror.
At server_first_seen_at t, count earlier eligible rated-format, corroborated series in (t - 7 days, t]. Equal-time records use lower server receipt sequence only.
Include zero-weight rated-format rematches; exclude custom practice, invalid/void, wrong-bracket and same-account matches.
Prior count 0 => 100%; 1 => 50%; 2 => 25%; >=3 => 0%.
Use event rows with exact timestamps, not daily aggregates.
Pair weight affects both gain and loss symmetrically.
The rule constrains known linked alts, not undisclosed other Battle.net accounts.
Server first receipt is chosen instead of editable client timestamps. Delayed uploads can still affect timing; 72-hour age validation bounds but cannot eliminate this weakness.
In-game estimate shows freshness; final weight is computed on server.
Unlimited unranked practice/rematches stay available.

### Eligibility and titles
Open established: 10 positive-weight series against >=5 distinct linked accounts.
Mirror established: 6 positive-weight series against >=3 same-class linked accounts.
Placement ratings update immediately but appear under New Challengers.
Mirror seasonal champion: >=10 positive-weight series and >=5 distinct opponents. If population cannot support this, award event trophies, not a false certainty badge.
Active: >=1 positive-weight series in preceding 14 days, using validated finish time. No rating decay.
An unresolved allegation does not erase a profile's rank; credible review holds concern a specific result.
One title-eligible character per account per class per board; best eligible character selected. Alt entries remain browsable.
Percentile titles require >=20 established active accounts in the pool. Top 10%/1% count is ceil(population*fraction); tied boundary ratings share recognition.
Passport, mentoring, attendance and sportsmanship never affect rating.
No gain-only escrow or special rating boost for newcomers.

### Ordering and replay
Server assigns immutable first_seen_at and unique monotonically ordered receipt_seq on first valid report.
Projection order is first_seen_at then receipt_seq. Never trust client clock for order; never use reconciliation completion order.
When an older pending match becomes eligible, or adjudication changes, recompute affected season in canonical order from 1500, including repeat weights.
Build a new generation with checkpointed bounded jobs; atomically switch active generation pointer only when complete and input revision still matches.
Keep previous generations and immutable decisions. A simple subtraction of an old delta is not sufficient.
Persist algorithm/policy version, input digest, generation, ordinal, prior pair count, weight, before/after ratings, reason.
Concurrent new evidence increments input revision; retry/schedule next generation instead of publishing stale mixed state.
Small beta can replay the whole season. Optimize only when measurements require.
First reports close 72 hours after season end; remaining peer evidence closes 72 hours later. Ordinary appeals settle seven days after final evidence close. Fraud corrections remain possible with audit.
Match pages disclose provisional updates caused by late evidence.

### Golden examples
Independent initial states unless specified:
- 1500/1500, A win, weight 1 => 1516/1484.
- Same start, weight .5 => 1508/1492.
- Same start, weight .25 => 1504/1496.
- Same start, weight 0 or equal-rating draw => unchanged.
- 1700/1500, favorite win => 1707.688/1492.312.
- 1700/1500, underdog win => 1675.688/1524.312.
- Three consecutive A wins from 1500 each, weights 1/.5/.25 => 1526.732/1473.268; fourth rematch zero.
Best-of-3/5 is one event with S determined by series outcome, never per-game rating.

### Anti-abuse
Review closed collusion clusters, high pair concentration, repeated suspicious forfeits, selective uploads, contradictory reports, relinking, and sudden title-cutoff feeding.
Shared household/network is not guilt. Never publish suspicion scores.
Identity unlink/rename cannot reset history.
Direct challenges allow favorable matchup selection: show opponent/class diversity and run varied-opponent nights. Do not secretly rebalance classes.
Before tuning, simulate honest sparse communities, smurfs, two/three/ten-account rings, grinders, late uploads and corrected results. Pair limits reduce farming, do not solve all collusion.

### Future teams
Fixed-roster team entity rated per size (2/3/5), separate from individual rank. Same pairwise formula can be reused after native roster/outcome evidence is demonstrated.
Roster changes and overlapping-account team cycling need explicit eligibility limits before activation.
Existing unranked queue may pair very different ranks; Elo handles expectation, but consent must exist before combat. No queue automation.

## World PvP and Gurubashi

### Three layers
Personal journal: automatically record permitted local observations; label claimed/game-counted/corroborated totals.
Scheduled events: known enrolled roster, simple scoring, referee support. Ship before a persistent global world ladder.
Persistent scores: only after attribution, coverage and abuse probes pass.

### Location domains
Formal Gurubashi contracts use normal duel rating when evidence/rules qualify.
Open Gurubashi Pit uses separate life/Heat/Pit score.
Ordinary world activity uses War score.
One source event cannot score in multiple domains.
A formal duel temporarily suspends Pit eligibility.

### Initial event scoring
For enrolled, corroborated eligible defeats: 100 points * level factor * repeat factor.
Level factor: victim same/higher level within event bracket = 1; one/two lower = .5; three+ lower or outside bracket = 0.
Repeat victim linked-account pair in rolling 24 hours: 1,.5,.25,0. Server receipt order/clock policy mirrors duel ingestion.
Round points half away from zero once at end. Maximum base event defeat 100.
Class/faction/guild filters are projections, not extra points.
No kill score from honor counter increase without opponent attribution.
Unknown source/group context does not qualify for solo bonus or solo board.
No bounty/rank/group multipliers initially; this prevents pretending unavailable context is known.
Referee-certified balanced-roster events can use declared team objectives, separately scored.

### Streak and Heat
Eligible kill starts/extends streak. Confirmed death/exit/logout ends the life; unknown continuity marks it incomplete and ineligible for longest-streak trophy.
Heat = min(5, number of distinct eligible opponents defeated this life).
Defeating a corroborated Heat target awards a cosmetic bounty claim in the initial release, not extra farmable points.
No negative score for dying. Survival time begins after first eligible kill and excludes unobserved continuity.
Entering Pit: explicit arm, 30-second countdown, no joining halfway through an ongoing encounter for retroactive points.
After exit/death: 60-second rearm cooldown. Leaving active combat triggers review, not invented automatic death.

### Fun events
King of the Arena: roster, countdown, one life, referee, crown.
Faction Hunt: 45-minute unique-opponent hunt, clear eligible level bracket.
Protect the Captain: enrolled champion/escorts, published route/objectives.
Guild Challenge: fixed roster limits and scheduled zone, exhibition standings.
Rookie Patrol: lower-level social event; no endgame players farming newcomers.
No actual game-world territorial control is promised.

### Community recognition
War/Pit boards show score, eligible kills, distinct opponents, evidence coverage and event wins.
Ranks begin as seasonal participation/achievement badges; percentile titles only after sufficient active population.
Names such as Scout/Raider/Champion are platform-only recognition.
Do not import Blizzard lifetime HK as platform-verified kills.

### Horn and intelligence
Manual opt-in War Horn: zone/subzone, coarse count, expiry <=10 minutes, cooldown five minutes, on-my-way responses; no exact live coords.
Bounty sightings: opted-in target only, five-minute delay, 15-minute expiry, zone-level and confidence. No nonparticipant tracking.
Opt-out takes effect locally immediately and remotely on receipt; stale entries expire automatically.
No gold/cash bounty, public harassment reward, or repeat camping progression.

## Community tournaments

### Make hosting easy
Templates: Eight-player Fight Night, Class Mirror Cup, Rookie Cup, Guild Invitational, Gurubashi Crown.
Public, unlisted and private events. Small unrated public events are available without organizer reputation grinding.
Trusted/sanctioned event badge is separate from ordinary hosting permission.

### Fields
Name/description, region/realm, visibility/invite membership, level/class bracket, format, entrants, ruleset version, venue/rally leader, dates/timezone, check-in, best-of per round, seeding, staff, stream link, dispute window.
Custom allowed items use the same builder as duels.
Changes after registration notify entrants and require consent for material rule changes.

### Formats
Single elimination first; round robin for small gatherings; double elimination next, Swiss later.
Byes advance bracket but never generate Elo.
Best-of is one rating event.
Bracket nodes have immutable seed identity plus lock_version.
Result advancement uses corroboration/referee decision; one participant cannot advance themselves unilaterally.

### Defaults
8/16 entrants, 15-minute check-in, best-of-1 early rounds, best-of-3 final, Standard preset.
No-show grace 10 minutes; event referee may advance opponent, but this is administrative progression and not an Elo win without a played/evidence-backed match.
Default event unrated. Sanctioned Standard can affect declared ladder, with usual repeat limits. A zero-weight final still awards the tournament trophy.
Custom formats have event standings, not official rating.

### Operations
draft -> published -> registration -> check_in -> seeded -> active -> review -> complete/cancelled.
Organizer handles bracket; referee handles assigned match; owner handles sanctions. No ruling own disputed match.
One player per linked account per event unless an explicitly casual alt format.
Audit bracket repair and reseeding; never silently rewrite finished rounds.
Do not reverse downstream bracket games automatically after a late appeal. Freeze affected branch, retain played games and let organizer publish a repair decision.

### Addon/website
Website builds/administers; addon shows next opponent/rules/ring, ready/report and dated bracket snapshot.
Cross-faction code/referee flow if local messaging fails. No live update promise without transport proof.
Spectator bracket and caster fight cards contain only public data and permitted delayed stats.

### Teams
Supervised 2s/3s exhibition may run with roster/referee despite no native arena. Unrated and interference-prone.
Rated native team modes need exact roster/start/outcome and pre-combat consent. Unequal ranks in unranked queue are expected.
When both sides have the addon, offer the common preset during the actual pre-match preparation window if communication is permitted. A per-mode standing opt-in can preauthorize an exact Standard version and rating conditions, but any changed terms require fresh acceptance. If discovery/consent cannot complete before combat, record practice only. Do not alter the game's queue or decline/cancel its match automatically.
5s is schema-ready but disabled until population and evidence justify it.

## Website experience

Tone: a welcoming player-run fight club. Fast, readable, mobile-friendly; unofficial identity. Avoid a corporate SaaS dashboard.

### Main pages
Home: next fight night, current cap, Find local fights, download, community highlights.
Leaderboards: Open, class-filter Open, Mirror; pool/season/bracket selection; established/new/inactive tabs.
Player: character, rating, placement progress, matchup history, rivals, passport, titles and public matches.
Match: rules, per-game score, origin/coverage evidence badge, clear pending/dispute/zero-weight reason, rating generation.
Rules: browse, clone, customize item/category exceptions, share code, show Standard eligibility.
Tournaments: public directory, private membership, builder, check-in, bracket, referee console.
World/Pit: separate journals/events/scoreboards with evidence and freshness.
Account: Battle.net connection, character claims, devices, session upload, privacy.
Status: build capabilities, known failures, config freshness.

### Rank UX
One understandable number. No RD/volatility/conservative score in v2.
Show “New Challenger: 6/10 series, 3/5 opponents” rather than hiding all progress.
Separate unconnected pools; a combined directory must not declare a single calibrated champion.
Class-filter board shares Open rating; Mirror card explicitly separate.
No fake reset-free rematch bonus.

### Result card
Winner/series, Confirm, Report problem, Rematch.
Show only meaningful issues: missing peer evidence, monitored-rule gap, suspected prohibited effect, stale config.
Addon Copy results opens a selectable batch; website Import results previews then submits it. Player never retypes captured match data. Companion users can save a whole session through one safe player-initiated reload.

### Sync experience
Follow 27_AUTOMATIC_RECORDING_AND_UPLOADER.md. Live sync status is easy to find on the player/account page. Import results is in Advanced / Recovery; Copy addon update is optional for refreshing the offline display. Preserve pasted input through sign-in, handle batches and duplicates, and separate report received from rating settled. Current website rating and last-known addon rating have explicit timestamps.
For automatic delivery, offer companion setup or a proven participant/relay carrier. Continue without a carrier means local practice, not a promise of automatic ranked uploads. No forced setup before practice, per-duel website visits, fake live connection badge in the addon, or reload-equals-upload wording. After website import, copying an update back is optional; the match can settle without it.

### Rules builder
Preset first, Advanced expandable. Item search by localized name plus canonical ID, category toggles, phase tabs, exception badges, estimated coverage.
Custom changes remove Standard-rated badge immediately. Share immutable version/code.
Unknown detector coverage is visible before acceptance.

### Accessibility and freshness
Keyboard, labels, contrast, reduced motion. Loading, empty, stale, partial, retry, authorization and quota states.
Unknown is not zero.
Data source/last-sync time on ranking, event and addon import pages.
Static SPA is fine for beta; dynamic social cards/crawlable public HTML require explicit prerender/worker endpoint later, not an implied SPA capability.

### Privacy/community
Quiet notifications, blocks, no unsolicited global chat. Optional rivalry sharing and screenshots/cards.
No public trust score or accusation feed. Moderation evidence private.
Measure actual usability and returning play, not growth funnels.

## Backend architecture

Modular application, managed Postgres and small trusted functions. No microservices required.

### Components
Static web; Supabase app Auth; server-side Battle.net connection; ingestion/reconciliation; rating generation jobs; rules catalog; tournament service; community events; moderation.
Optional desktop helper uses upload-only endpoint. Lua has no arbitrary HTTPS route.

### Reads/writes
Public read models via RLS-safe views. Private user data owner-only.
All identity, adjudication, rating, bracket, sanction and rules-publication mutations through scoped functions.
No service role in browser/addon.
Server roles and object storage privacy are independent of whether Cloudflare serves the website.

### Transaction design
Do not implement rating via several unrelated REST calls.
Small trusted Postgres RPC commits one generation/chunk/ledger batch with constraints, revision check and locks; or a server connection executes an explicit transaction.
TS rating computation is deterministic pure logic; commit compares source revision/preconditions and retries stale work.
Replays write inactive generation then atomically publish pointer. No partial public generation.
Security-definer RPC fixes search_path, explicitly validates actor/scope and revokes public execution.

### Jobs
Postgres jobs with type, state, available_at, attempt_count, lease_until, cursor, idempotency key.
Claim with SKIP LOCKED; recover expired leases, bounded retries, dead-letter reason.
Jobs: reconcile, replay season, projection publish, reminders, bracket maintenance, expiry, retention.
Checkpoint replays across function invocations. Provider CPU/time limits prohibit assuming an entire growing season fits one request.

### Idempotency
Actor+route+key unique; same body returns original response, different digest -> 409.
Ingestion additionally enforces unique origin nonce and immutable session identity.
Exactly-once effects are achieved by constraints/transactions, not by promising exactly-once transport.

### Freshness
Leaderboard latest completed generation displayed with time.
Addon config/rating snapshots show imported_at and expiry.
Browser event progress may poll when visible; no all-users permanent realtime subscription.
Live server kill switch pauses server writes, not offline clients.

### Budget
Keep decisive facts and bounded match summaries in Postgres; private compressed evidence objects only when useful.
No full unlimited combat-log stream retained. Cache public results; paginate.

## Database model and invariants

PostgreSQL; UTC timestamptz, immutable UUID identities, explicit FK/check/unique constraints and RLS.
This is a schema specification; agent must generate executable migrations and permission tests.

### Identity
profiles(id PK, public_slug UNIQUE, preferences JSONB, status, created_at).
accounts(id PK, profile_id UNIQUE FK, status).
provider_identities(id, account_id FK, issuer, subject_digest, encrypted_provider_metadata, UNIQUE(issuer,subject_digest)); private.
characters(id, account_id FK, product, environment, region, realm_id, readable_guid NULL, class_id, faction_id, level, verification_tier, verified_at).
character_aliases(character_id, realm/name, valid_from, valid_until); no name-only rating reset.
character_verifications(id, character_id, method, witness_id NULL, evidence_ref, status, expires_at NULL).
installations(id, account_id, credential_digest NULL, revoked_at, last_seen); tokens never public.
addon_snapshot_counters(account_id PK, last_sequence BIGINT); atomically allocate increasing safe-integer sequence for website-to-addon exports. Snapshot requests participate in idempotency records; retries reuse the same immutable response. Sequence orders snapshots, not rating generations.
oauth_states(digest, initiating_account, expires_at, used_at); TTL cleanup.

### Configuration
client_builds; capability_tests; feature_flags; detector_catalog_versions; ruleset_versions; seasons; competition_pools; level_brackets; hub_definitions.
Immutable published ruleset content/hash. Season references active policy version and pool scheme.
Capability tests store source-only vs live-tested status distinctly.

### Match
match_contracts(id/session UUID PK, contract_hash, canonical JSONB/bytes digest, season_id, pool_id, ruleset_version_id, rated_intent, ladder NULL, best_of, accepted_expiry).
match_participants(match_id, character_id, account_id_at_match, side); unique match+character and match+side; ordinary duel exactly two enforced at publication.
match_reports(id, match_id, origin_character_id, origin_account_id, installation_id, nonce, body_digest, received_at, auth_method); UNIQUE(origin_account_id,installation_id,nonce).
match_report_revisions append-only with supersedes_id. Duplicate nonce differing digest rejects rather than silently updates.
report_evidence(report_id, bounded facts JSONB, coverage JSONB, private_object_ref NULL).
matches(id FK contract, lifecycle, evidence_state, rating_state, first_seen_at, receipt_seq UNIQUE, finished_at, current_decision_id).
match_games(match_id, game_index, winner_character_id NULL, finish_reason, coverage); UNIQUE(match_id,game_index).
adjudications(id, match_id, result, reason, actor_id, evidence_refs, created_at, supersedes_id NULL); append-only.

### Rating
rating_policies(id, algorithm, immutable configuration).
rating_generations(id, season_id, input_revision, algorithm_version, status, cursor, created_at, completed_at).
season_projection_heads(season_id PK, active_generation_id, input_revision).
rating_ledger(id, generation_id, match_id, ladder_key, participant_character_id, before_milli BIGINT, delta_milli BIGINT, after_milli BIGINT, pair_prior_count, pair_weight, ordinal).
UNIQUE(generation_id,match_id,ladder_key,participant_character_id). Enforce after=before+delta and paired deltas sum zero within committed event.
ladder_members(generation_id, ladder_key, character_id, rating_milli, positive_series, distinct_opponents, last_activity); UNIQUE(generation_id,ladder_key,character_id).
Pair authority: eligible match event rows + immutable account snapshots/time. Daily aggregates are optional cache, never exact seven-day source.
No rating_escrow/RD/volatility tables in v2.

### Events/community
tournaments, event_staff, registrations, entrant_members, check_ins, bracket_nodes, event_matches, rules_acceptances, announcements.
optimistic lock_version for event/bracket changes.
world_opt_ins, world_sessions, kill_reports, kill_decisions, score_ledger, pit_lives, horns, sightings, crowns.
One kill source cannot score both War and Pit; unique score_source/domain constraint enforced transactionally.
rivalries/passport/achievements are derived non-rating projections.

### Integrity/operations
disputes, evidence_attachments, moderation_actions, sanctions, appeals, audit_events, idempotency_records, jobs.
No client writes to ledger, decisions, roles, provider identity or capability approval.
Moderator permissions scoped; own-case ruling prohibited except documented emergency owner action with later review.

### RLS
Public: published sanitized profiles/matches/rules/events and active projection.
Owner: own preferences, claims, report status and dispute submissions.
Organizer/referee: assigned event operations through functions.
Service: only trusted backend functions/jobs.
Private events: membership ACL, not merely an unguessable URL.

### Retention
Permanent while service operates: rating inputs, contract/result/adjudication history and replay-relevant policy versions.
Verbose evidence 90 days unless disputed; cases retain evidence until resolved plus 90 days.
Live hub presence minutes; expired horn/sighting content 24 hours.
Deletion pseudonymizes public identities and preserves minimal replay inputs as disclosed. Remove credentials/private optional content.
Budget actual row/index sizes; never retain unlimited raw event logs in 500 MB database.

## API contracts

Implement versioned trusted functions plus RLS-safe reads. Agent generates OpenAPI 3.1 and executable JSON Schemas from these requirements.
Base /v2; JSON UTF-8, integer timestamps or ISO UTC at external display boundaries; UUID identities.
Every authenticated mutation needs idempotency key except OAuth callback, which uses one-use state.

### Routes
| Method/path | Auth/scope | Behavior |
|---|---|---|
| GET /config | public | supported builds, seasons, presets, expiry/version |
| POST /identity/battlenet/start | app user | create session-bound OAuth state/redirect |
| GET /identity/battlenet/callback | validated OAuth state | server exchange and bind provider |
| POST /characters/claim | user | claim identity, never automatically verify ownership |
| POST /characters/:id/verify | witness/official adapter | append scoped verification |
| POST /devices/pair | user | short-lived single-use pairing intent |
| POST /devices/redeem | pairing proof | issue report-submit and own-receipt-read scoped credential |
| DELETE /devices/:id | owner | revoke; keep match history |
| POST /sync/ingest | user/helper | size/schema/origin validation, per-report response |
| POST /sync/attest | user | approve exact own report digests; no approval for opponent |
| GET /sync/receipt | owner/helper | own report processing statuses; helper cannot read other account data; no-store |
| POST /sync/addon-update | owner browser session | bounded WFU1 snapshot with account sequence; receipt cursor, selected characters; idempotent and no-store |
| GET /matches/:id | public/ACL | sanitized result; evidence ACL separate |
| POST /matches/:id/disputes | participant/referee | structured allegation; no auto-forfeit |
| GET /leaderboards/:id | public | active projection generation + cursor |
| POST /rulesets | user | draft custom config |
| POST /rulesets/:id/publish | owner | immutable version, never self-sanction Standard |
| POST /tournaments | member | small draft event |
| POST /tournaments/:id/actions | scoped organizer | typed lifecycle/bracket actions |
| POST /tournament-matches/:id/rulings | assigned referee | audited evidence-backed ruling |
| POST /world/opt-in | user | explicit consent/version |
| POST /world/reports | enrolled user/helper | experimental bounded evidence |
| POST /moderation/:case/actions | staff | scoped audit decision |

### Ingest request/response
Input: encoding enum raw-deflate-base64url, envelope string, optional declared schema; transport may also accept decoded JSON with same caps.
Output: requestId, receiptId, items[{nonce,status,matchId,reasonCodes}], serverTime, configVersion.
Status: accepted, duplicate, rejected, awaiting_peer, corroborated, disputed, rating_pending.
Do not promise immediate rank application inside upload request.
Each item's origin must authenticate independently. Receiving two report bodies from one uploader isn't two authenticated people.

### Errors
error:{code,message,requestId,retryAfterSeconds?,fieldErrors?}.
401 unauthenticated, 403 forbidden, 404 not found, 409 idempotency/state conflict, 413 too large, 422 validation, 429 throttled, 503 temporarily paused.
Reason codes: hash_mismatch, duplicate_origin_nonce, outcome_conflict, coverage_unknown, identity_unverified, pair_zero_weight, wrong_bracket, expired_config, unsupported_build, missing_peer, referee_ruling.

### Limits
Default upload 256 KiB decoded/128 KiB compressed, 25 reports, 10 requests/minute/account with burst 3.
Allow retry without creating new evidence; backoff on 429.
Cursor/ETag for public pages; no-store on private identity/config receipt/codes.
Private event invite code is an enrollment hint; membership ACL enforces actual access.

## Practical community integrity

Assume clients can be edited and friends can collude. Promise transparent community verification, not anti-cheat.

### Controls that matter
Battle.net connection with stable private provider identity; separate character proof.
Authenticated report origin; content hashes are not signatures.
Schema/size/decompression/rate limits; idempotency; RLS; append-only decisions; exact rating replay.
No tokens in Lua. Scoped helper credential in OS store. File parser never executes Lua.
HTTPS, secure app session handling, OAuth state/redirect validation and server-only secrets.
MFA for owner/staff where available. No public raw evidence buckets.

### Volunteer roles
Member, event organizer, assigned referee, owner/moderator.
Ordinary small unrated hosting open to members. Sanctioned rating events need review.
A volunteer cannot decide their own dispute.
Permanent bans/title removal get second review when another trusted moderator exists; solo-owner emergency suspension is allowed with public reason category and later review. Do not make two staff an impossible prerequisite for running a hobby beta.

### Missing uploads and false disputes
No automatic wins on a one-sided report.
Do not erase ranking because someone files an allegation.
Notify, allow bounded response, adjudicate evidence. Repeated demonstrated abandonment/false allegations can limit ranked access.
Shared IP, household, unusual win rate, or class matchup advantage alone is never proof.

### Privacy
Character public for ranked history; BattleTag/provider IDs/tokens private by default.
No unrelated private chat, exact hostile tracking, device fingerprinting, or IP-derived public information.
World/Pit opt-in; location coarse and expiring.
Deletion revokes identity/device credentials and removes optional private content; pseudonymize minimal competition history needed for audit, clearly disclosed.
90-day verbose evidence retention, extended for disputes. Keep replay-relevant outcome/decision inputs.

### Moderation
Simple queue: claim, compare evidence, decide, give reason, permit appeal, archive.
Actions: uphold, correct, void, game loss/DQ, temporary ranked restriction, ban, bracket repair.
No public accusation feed or automated “cheater” label.
Rate limit unsolicited challenges/horns and allow blocks/quiet mode.

### Release basics
Secrets scan, RLS cross-account tests, malicious upload tests, token revoke, replay/idempotency, backup restore, pause-rating switch and private security contact.
Code signing and policy review for optional helper; never instruct bypassing OS security.

## Low-cost community infrastructure

### Recommended
React/TypeScript/Vite static web on Cloudflare Pages.
Supabase Postgres/Auth/Storage/Edge Functions; server-side Battle.net connection adapter.
GitHub repository/CI/releases, subject to actual account limits.
No Redis, microservice mesh, always-on AI API, paid analytics or native companion hosting server.

### Budget
Closed beta can be $0/month plus optional domain, within quotas.
First useful paid upgrade: managed DB reliability/backups, around $25/month at checked Supabase pricing; evaluate actual plan then.
Optional email delivery/domain/code-signing/distribution may add cost. Do not promise zero-cost polished signed desktop distribution.
No automatic paid provisioning in coding tasks.

### Checked limits
Supabase pricing checked 2026-09-19: Free 500 MB DB, 1 GB storage, 50k MAU, 5 GB egress, two active projects, inactivity pausing after one week; Pro starts $25/month. https://supabase.com/pricing
Cloudflare Pages static hosting suitable for beta; check builds/assets limits before launch. https://developers.cloudflare.com/pages/platform/limits/
Supabase default SMTP is limited to authorized team addresses and unsuitable for community onboarding; configure custom SMTP or supported social login. https://supabase.com/docs/guides/auth/auth-smtp
Edge Functions have bounded CPU/duration; chunk replays/jobs. https://supabase.com/docs/guides/functions/limits
Cloudflare hosting does not automatically protect directly reachable Supabase endpoints; enforce backend limits/auth.

### Environments
Local Supabase + fixtures; one hosted beta; second free project optional staging.
No per-PR production identities. Preview frontend uses scrubbed/local/shared staging data.
Versioned migrations and config. Pin compatible dependencies in lockfile, not invented prose versions.

### Deploy
Focused lint/test/typecheck -> migrations/RLS -> web build -> addon ZIP -> preview -> explicit release.
Test client build for addon-affecting releases. Pure website copy fixes need not wait for WoW access.
Cache public leaderboards and poll event pages only while visible. Avoid thousands of idle realtime subscriptions.

### Backups/operations
Free beta: explicit logical DB export to a separate encrypted location, credentials only in CI; private storage objects need separate backup plan.
One successful restore drill before public ranking. Managed DB backup does not imply object files are backed up.
Warn at 60/80/95% quotas; degrade nonessential evidence uploads before core match intake.
Keep tiny decisive facts in DB, bounded compressed evidence in private storage. No unlimited raw logs.
Document a five-minute owner runbook: pause rating, inspect queue, restore config, revoke device, resolve case.

## Focused testing and operations

### Reference tests
Run: node --test reference/rating.test.mjs.
Covers known deltas, draws, zero weight, seven-day boundary, same-time ordering, alt/Mirror repeat sharing, invalid/same-account exclusion, replay ordering, late void, duplicate receipt, numeric validation, conservation and bounded changes.
This reference is not a production backend or empirical anti-cheat validation.

### Production tests
Unit: canonical bytes/hash, chunk parser, state transitions, item catalog ambiguity, detector coverage, scoring, bracket construction.
Integration: RLS, provider mapping, OAuth state replay, origin authentication, idempotency, generation publication CAS, pairing token scope, private events, adjudication.
End-to-end: practice duel fixture -> batch upload -> corroborated -> ranked -> profile; custom rules -> not globally ranked; event -> bracket.
Client: every affected build/context probe in 04, recording freeze/secret handling, no protected-action errors.

### Adversarial cases
Losing user withholds; one uploader forges second report; both claim win; account/character impersonation; altered contract after acceptance; duplicate/reordered chunks; compressed bomb; duplicate session under new hash; late report/season close; unknown detector mistaken for clean; allowed class heal mistaken for potion; intentional potion to avoid loss; false dispute of champion; alt relink; same-household honest players; raw Lua injection in SavedVariables; uploader credential used for moderation; reconnect after disk rotation.

### Rating simulations before public ranking
Sparse 6/12/30-player groups, Mirror class scarcity, class matchup selection, new strong player convergence, two/three/ten-account collusion rings, 1000-game volume versus diverse opponents, selective late uploads and rollback.
Measure convergence, pair concentration, title eligibility, false sanctions and honest players blocked by limits.
Do not present simulation as proof against collusion.

### Telemetry
Match-stage counts, unknown coverage, upload delay, missing peer rate, detector false positives confirmed by referee, projection age, job retries, DB/storage usage and weekly referee workload.
No raw private reports in product analytics. No mandatory third-party marketing analytics.
Rank duplicate effects = zero allowed.

### Runbooks
Rating bug: pause rating writes, keep evidence intake, snapshot affected inputs, reproduce, fix tests, build inactive generation, compare, publish, explain.
Build break: disable affected detectors, preserve practice, show unknown, retest, release capability config.
Provider outage: local queue persists; no local authoritative rating; resume idempotently.
Identity compromise: revoke device/provider session as applicable, hold specific suspicious reports, verify recovery, replay if necessary.
Volunteer overload: reduce sanctioned events, simplify rules or pause experiment before adding bureaucracy.

## Build roadmap

The coding agent is capable; provide exact contracts and let it implement. Client tests need real testers, so independent website work continues in the meantime.
No startup staffing plan or promise tied to an assumed beta calendar.

### M0 — prove interfaces and core schemas
Deliver and run 30_TWO_DEVELOPER_BETA_LAB.md: probe duel outcomes/comms/combat restrictions/file flush, live disk logs, signatures, relays and inbound rating possibilities. Build companion and two-account test ingestion now, not after the recorder UX is settled.
Create schema v2 fixtures, monorepo and local DB.
Run included rating reference tests.
Ship a status/capability page and simple local journal.
Exit: known/unknown is documented; ordinary duels never broken.

### M1 — enjoyable practice slice
Custom rules editor, Standard preset, direct challenge, mutual acceptance, automatic recorder/result card/rematch, automatic batch delivery through a proven bridge, recovery-only export, web match/history.
Use synthetic detector fixtures until client catalog is proven.
Exit: two testers can complete and view a session without retyping results.

### M2 — identity and shadow ranking
Battle.net connection, character claim/witness/provider adapter, authenticated report batches, reconciliation, private staff case view.
Implement exact Community Elo and generation replay; run shadow results and abuse simulations.
Harden the lab-proven uploader; evaluate one-upload/two-signed-origin reports before promoting that path. Do not promise immediate sync without measured delivery.
Exit: no spoofed second origin, duplicate effects or stale projection publication.

### M3 — community ranked beta
Open, class-filter, Mirror, placements, known-alt pair decay, simple rivalry/passport, optional city hub boards, first rookie/class night.
Reliable automatic delivery for supported setups is a ranked release gate. If only reload-flush works, document batch-sync UX and review it with both developers; never silently replace automation with routine copy/paste.
Minimum admin void/adjudication and appeal path exist before public rank.
Exit: controlled community series stable, explainable and fun.

### M4 — events
Public/private/unlisted builder, single elimination + small round robin, check-in, volunteer referee, fight cards, bracket recovery.
Sanctioned Standard follows same rating rules; private custom events remain free/easy.
Gurubashi supervised exhibitions and crown night can run unrated despite persistent scoring being unready.

### M5 — deeper community/world
Guild event calendar, mentoring/practice tags, themed nights, War journal, enrolled faction events.
Then promote Pit/War score only when attribution/coverage pass.
Add double elimination/caster tools as actual organizers need.

### M6 — native teams
Prove live queue/start/roster/result interfaces, pre-match consent and cross-faction transport.
Fixed team ratings per size; 2s then 3s, 5s if participation warrants.
The Blizzard unranked queue remains optional/external, not an addon-created ranked queue.

### Complexity limits
No paid tiers, gold escrow, hidden MMR, repeat-gain escrow, combat coaching, Redis by default, twenty official ruleset ladders, or reputation barriers to ordinary hosting.
Preserve future adapters but ship useful increments.

## Release acceptance gates

### Recorder/practice
- [ ] Exact client build recorded; capabilities marked source-only versus tested.
- [ ] Ordinary duel unaffected by addon decline/timeout.
- [ ] Both accept identical immutable rules; custom presets work.
- [ ] Automatic local report and compact result card; no manual score transcription when evidence available.
- [ ] Coverage gaps preserved; no secret-value processing.
- [ ] Session export/import bounded, correct and duplicate-safe.
- [ ] Unsynced records survive normal reload/logout/migrations and storage warnings.

### Identity
- [ ] Battle.net state/redirect/token validation and recovery tested.
- [ ] Provider identity private and stable across reconnect.
- [ ] Character tier accurately reflects claimed/witnessed/official ownership.
- [ ] No fabricated Forever endpoint or local code treated as ownership proof.
- [ ] One user's upload cannot authenticate another participant.

### Ranked beta
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

### Rules/detectors
- [ ] Category/item exceptions, phase rules, rest and series settings immutable/versioned.
- [ ] Custom change removes Standard eligibility.
- [ ] Allowed class heal vs banned consumable ambiguity tested.
- [ ] External source, pet ownership, secret payload and log gaps represented honestly.
- [ ] Candidate violation needs independent evidence/referee before sanction.

### Automatic delivery and optional personal uploader
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

### Events/community
- [ ] Member can create private/public/unlisted casual event.
- [ ] Registration/check-in/byes/no-show progression/own-case restrictions correct.
- [ ] No-show bracket advancement doesn't invent Elo match.
- [ ] Passport/rivals/fight cards don't change rating.
- [ ] Quiet mode/block/decline work.
- [ ] World/Pit opt-in, domain dedupe and unknown-context exclusions work before scored release.

### Operations
- [ ] Cross-account RLS and private-object access tests pass.
- [ ] Backup/restore and pause-rating work.
- [ ] Quotas bounded; jobs resumable; owner runbook usable.
- [ ] Keyboard/mobile/accessibility pass on core flows.

## Decisions and open questions

### Accepted v2 decisions
ADR-001: ranked duel anywhere; optional local hubs only.
ADR-002: independent evidence required; upload count is not independent origin count.
ADR-003: automatic recorder; manual session sync fallback; optional read-only helper early.
ADR-004: separate Open/Mirror, War, Pit and custom event standings.
ADR-005: Cloudflare static web + Supabase beta, no unnecessary services.
ADR-006: passive combat administration; no tactical automation/hidden-data reconstruction.
ADR-007: exact Community Elo v1 supersedes Glicko-2/escrow. Simplicity and exact repeat math suit this project.
ADR-008: Battle.net linked account != verified Forever character.
ADR-009: intentional/proven prohibited action loses game instead of voiding ranked result.
ADR-010: event sourcing for evidence/decisions plus versioned derived rating generations.
ADR-011: no claim of immediate addon->web or web->addon sync without proven transport.
ADR-012: no founder/business funnel, monetization gates, or enterprise staffing prerequisite.

### Open client questions
Exact winner/start signals for all duel termination paths.
Readable combat-log and aura fields by context/build.
Cross-faction transports and throttles.
Actual SavedVariables/disk-log flush behavior.
Official Forever ownership namespace/endpoint availability.
Native arena queue availability and full rosters/results.
Precise hub area IDs; layer co-location checks.
These need fixtures and testers, not guesses. Disable only affected capabilities.

### Open community choices
Final name/art style, launch region/realm, trusted initial witnesses, Standard class-created item catalog, first weekly fight-night time.
Defaults in specs allow coding now. Do not block the whole build on branding.

### ADR template
Title, status, date, context, decision, alternatives, player impact, integrity/privacy impact, migration/rollback, fixtures and owner.
Algorithm/rules changes need a published version. No silent mid-season arithmetic changes.

### ADR — v2.2 automatic delivery and retail baseline
Accepted product decision: assume retail-style addon APIs as the starting point and validate all relied-on behavior in the two-developer lab (docs/30). Manual result import is diagnostic/recovery only. Move companion and independently enrolled signed-receipt experiments into the first builds; one uploader may carry two authenticated origins only after crypto and transport gates pass. No-carrier sessions remain local/practice, and silence never authenticates an opponent. Public ranked release needs a measured automatic delivery path; no promise of live sync or automatic inbound rating until tested.

## Glossary

- Battle.net-linked: authenticated control of a provider identity, not unique person or Forever character proof.
- Claimed/witnessed/provider-verified: distinct character identity strengths.
- Contract: mutually accepted immutable match terms.
- Corroborated: community evidence threshold met, not Blizzard server attestation.
- Coverage: what a detector could actually observe over a game interval.
- Candidate violation: observation requiring validation, not automatic guilt.
- Community Elo: versioned 1500-start, K32 symmetric rating system.
- Milli-rating: rating stored as integer thousandths.
- Pool: connected eligible competition population; isolated factions/realms not automatically calibrated.
- Open: any-class Standard ladder; class views filter it.
- Mirror: independent same-class ladder.
- Series: best-of contract, one rating event.
- Pair weight: known linked-account repeat multiplier across alts/ladders.
- Projection generation: complete replayable snapshot of derived ranks.
- Passport: non-rating achievement and encounter history.
- Pit: opt-in Gurubashi open competition, separate score.
- Heat: eligible distinct opponents defeated during current Pit life.
- War Horn: coarse opt-in expiring call for help.
- Uploader: optional external file watcher; Lua addon is not an HTTP client.
- Awaiting peer: report lacks enough independent evidence; no rating yet.

## Sources and limits of verification

Review date 2026-09-19. Public web documentation and local source inspection are not live-client testing.

### Blizzard identity
Verified public discovery response:
https://oauth.battle.net/.well-known/openid-configuration
Includes issuer, authorize/token/userinfo/JWKS endpoints. This supports account linking; not proof of character ownership.
Official OAuth portal: https://develop.battle.net/documentation/battle-net/oauth-apis
Classic profile portal: https://develop.battle.net/documentation/world-of-warcraft-classic/profile-apis
Portal/profile pages could not be retrieved during this revision. No authenticated Forever ownership test performed.

### Client source
Inspected local checkout commit 70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e (1.60.1/69913).
Snapshot: https://github.com/Gethe/wow-ui-source/commit/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e
Duel: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/DuelInfoDocumentation.lua
Combat: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/CombatLogDocumentation.lua
Chat: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/ChatInfoDocumentation.lua
Unit: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua
New online branch retrieval was unavailable; the identified local commit was re-inspected. Do not market this as a live latest-build certification.

### Hosting/operations
https://supabase.com/pricing
https://supabase.com/docs/guides/database/functions
https://supabase.com/docs/guides/functions/limits
https://supabase.com/docs/guides/auth/auth-smtp
https://developers.cloudflare.com/pages/platform/limits/
Provider limits can change; check before provisioning.

### Rating
Glicko-2 reference reviewed: https://www.glicko.net/glicko/glicko2.pdf
v2 intentionally does NOT implement Glicko-2. Community Elo parameters/repeat policy are original product decisions specified in 09 and tested in reference code. They are not attributed to Blizzard or claimed optimal without beta evidence.

### Community ideas
Rookie/class nights, fight cards, rivals, passport and scheduled hunts are design recommendations. This revision did not conduct a new representative forum survey.
Original plan's forum ideas are qualitative inspiration, not proof of universal demand or technical feasibility.

### Pending verification
Live client outcomes, combat visibility, item catalog correctness, helper flush timing, third-party OAuth app behavior and Forever ownership all need human/configured integration tests.

## Fixtures and friendly copy

### Seed fixtures
Cap-20 archived and cap-30 active example seasons; separate faction pools.
Standard/Pure Duel/Fieldcraft/Anything Goes/custom rule versions.
Members, linked alts, unverified claim, witness/referee/owner, revoked helper.
Matches: practice, awaiting peer, corroborated, disputed, zero-weight, corrected, custom.
All supported classes, sparse Mirror class, new/established/inactive profile.
Events: public/private/unlisted, byes, no-show, custom rules and late bracket correction.
Detector traces: allowed heal, banned known effect, ambiguous effect, secret unavailable, buffer gap.
Synthetic data only.

### Copy
Ranked: “Both players agree to these rules. Results count when enough independent evidence reaches the site.”
Monitoring gap: “This rule cannot be fully monitored here. You'll confirm it after the fight.”
Repeat limit: “Keep the rivalry going. This rematch is practice for rating.”
Waiting flush: “Recorded. The uploader is waiting for WoW to save this session.”
Reload button: “Save results & reload”
Reload help: “With the companion running, your saved results upload automatically.”
Manual path: “Copy results” -> “Import results”
Return path: “Copy addon update” -> “Import update”
Offline rating: “Last known rating · updated [time]”
Local outbox: “[count] reports not yet acknowledged here”
No companion: “Reload saves your results on this computer. Use Copy results to send them to the website.”
Unsafe reload: “Finish this fight and result capture before reloading.”
Website receipt: “Reports received. Ratings update when the required evidence is complete.”
Companion retry: “Offline. Your saved results will retry automatically.”
Waiting peer: “Your report is safe. We're waiting for the other side's evidence.”
Custom: “Your rules, your fight. This preset doesn't change Standard ranking.”
Violation candidate: “Possible rule issue. Review the evidence before deciding.”
Dispute: “This match is under review. Your other results remain visible.”
Provider: “Battle.net connected. Character verification is a separate step.”
Unofficial: “A free player-run project, not affiliated with or endorsed by Blizzard Entertainment.”

### Defaults
Direct requests/results and joined-event action notices on.
General hub/event broadcasts off.
World/Pit/Horn opt-in.
No marketing opt-in or daily streak nag.

## Engineering setup

### Stack
pnpm workspaces; pinned current Node LTS; React/TypeScript/Vite; router, query cache and schema validator chosen consistently.
Supabase CLI/local Docker database, SQL migrations/RLS tests.
Lua client-compatible syntax, explicit Blizzard adapters, Luacheck/StyLua or verified equivalents.
Vitest for TypeScript, Playwright for core web flows, Lua fixture runner.
Optional helper chosen after file-watch spike; no desktop framework required to begin web/addon.
Do not assume Battle.net is a native Supabase Auth provider.

### Commands the agent implements
dev, build, lint, typecheck, test, test:e2e, db:reset, db:test, addon:test, addon:package.
Reference already runnable: node --test reference/rating.test.mjs.
Shared JSON Schemas v2 generate TS types/validators and Lua valid/invalid fixtures.

### Package boundaries
contracts imports no app; rating is pure deterministic logic; web has no authoritative rank mutation.
Backend validates independently. Addon receives only public config/identity, never server/provider secrets.
Helper parser has bounded input and executes no Lua.
Do not ship reference tests/probe logs in addon ZIP.

### Environment
Public: SUPABASE URL/publishable or anon key, site URL.
Server only: service key, DB migration credentials, Battle.net client ID/secret/callback configuration, provider-token encryption secret where retention is needed.
Helper: per-device revocable upload-only token in OS store.
CI backup credentials isolated from web build.
Commit example placeholders, never values.

### Quality
Lock dependency/runtime versions, secret scan, core auth/RLS tests, deterministic protocol fixtures and rating tests.
Build release addon ZIP with correct .toc and changelog.
Render minimal useful UI; accessibility/mobile checks.
Routine docs/UI changes need focused tests, not a full client lab run.

### Artifacts
Web build, addon ZIP/checksum, migrations/config manifest, optional helper build/hash, source capability record.
Owner-friendly setup guide must state developer app registration and real client tests that code alone cannot perform.

## Battle.net linking and character ownership

### Confirmed public capability
Blizzard's discovery endpoint exposes authorization, token, userinfo, issuer and JWKS URLs:
https://oauth.battle.net/.well-known/openid-configuration
Checked 2026-09-19. Discovery is not proof every advertised grant/scope is available to a new third-party client.
Official portal: https://develop.battle.net/documentation/battle-net/oauth-apis
The portal/profile documentation could not be retrieved during this review. Forever character ownership API support is unconfirmed. No authenticated Blizzard request was performed.

### Model
Internal platform account -> private provider identity -> character claims.
Key provider identity by validated issuer + subject/account ID. BattleTag is display data, not a stable primary key.
One provider identity maps to one competition account. Reconnection preserves history.
BattleTag private by default; public identity uses character/display name.
OAuth proves account control, not unique human, subscription count, or untampered addon.

### Implementation
Use Supabase app authentication plus server-side Connect Battle.net adapter. Do not assume a native Supabase Battle.net provider exists.
Primary Battle.net login can be added once supported session integration is demonstrated; same stable mapping, no duplicate account creation.
Authorization-code flow, registered redirect allowlist, single-use state bound to initiating app session; PKCE when supported by the registered client.
Provider secret/token exchange on server only. Validate userinfo/identity; validate issuer/audience/signature/nonce if using ID tokens.
Minimum scopes; character-profile scope only if an actual Forever ownership route is documented and tested.
Retain encrypted provider tokens only as required. Never send them to addon/helper.
Reauthentication for linking/unlinking; never merge accounts by matching email or BattleTag.
Private provider IDs never appear on public profile APIs.

### Character tiers
claimed: self-reported, practice.
witnessed: volunteer verifies fresh server challenge from the actual in-game character; record witness, time, realm/build and evidence.
provider_verified: official supported ownership response binds that character to authenticated account.
An exported code from an editable addon alone is not character proof.
Prefer readable stable GUID plus game product/environment; preserve name/realm aliases and rename/transfer history. If only name is available, label identity weaker and require re-verification on reuse.
Beta/live identities separate. Deleted/recreated characters need re-verification.

### Test task
Register app; authorize a consenting tester; inspect documented owned-character route for exact Forever namespace/identity. Save redacted response fixture, endpoint, scopes, freshness, failure states.
If unavailable, use witnessed beta enrollment and keep functionality working.
Practice needs no Battle.net; ranked beta requires connection plus witnessed/provider tier. Private custom events can accept claims without global rating.

## Automatic reporting and optional uploader

### What runs automatically
Addon records duel observations, infers supported outcomes, records item findings, and queues a complete session.
Addon messages go to game clients, not an arbitrary web server. Website upload requires an external helper or user export.
Automatic recording, automatic file flush, outbound upload, and inbound config updates are separate capabilities.

### UX priority — automatic delivery first
v2.2 policy: normal players should not copy/paste results. Automatic delivery through a companion on either participant or a proven relay is the intended experience. Manual reporting below is diagnostic/recovery functionality. First prove these routes using 30_TWO_DEVELOPER_BETA_LAB.md. Retail-style APIs are the working baseline, subject to exact-build tests.

Automatic capture is always on for agreed sessions. Playing, rematching, and local history never require opening the website after each duel. Practice works before account setup. Offer the optional companion at the first visit to Sync, not as a blocking install wizard. All accepted reports have identical rating rules and evidence requirements, regardless of transport.

| Path | Player action | Result |
| --- | --- | --- |
| Companion installed and running | Save results & reload, once between fights or at session end | WoW flushes saved reports; companion uploads complete records; website processes evidence |
| No personal companion, proven signed carrier available | No per-match action | Opponent/relay automatically carries both independently authenticated statements |
| No automatic carrier | Local/practice recording; recovery export in Advanced | Do not promise automatic ranked delivery |
| Addon only, reload only | Reload UI | Saves reports locally; does not contact the website |

Normal WoW behavior is to flush SavedVariables on UI reload as well as clean logout. Verify this on the exact Forever build before enabling the reload sync onboarding claim. Full logout is not the intended routine workflow; if reload fails the beta probe, show the measured fallback and retain copy/paste. Never promise an immediate disk write after each duel.

### Companion flow
One-time setup: select the WoW installation and explicitly approve the addon's file path, pair through the browser, select the app account, then return to play. Suggest likely installation paths without uploading or broadly reading unrelated account data. Multiple installations/accounts need an explicit selection and clear labels. Optional launch at login requires consent.

During play, capture every agreed match automatically. Between fights the addon exposes a quiet Sync panel with a local saved/export queue count and last imported website status. Primary action: **Save results & reload**. Supporting text: **With the companion running, your saved results upload automatically.** An Advanced / Recovery action is **Copy results**; do not present manual export as routine onboarding. Remember the chosen mode; do not re-run onboarding each session.

Reload is player-initiated only. Disable the button during an active duel/series game, combat, unfinished outcome capture, or essential peer exchange. Explain why and re-enable when safe; an idle interval between completed games can be safe once reports and peer delivery are durable. No automatic reloads or repeated confirmation modal for a normal safe click. Retain reports across reload and retry unsent peer messages afterward.

The companion waits for a complete stable file, uploads all eligible records, retries transient errors, and deduplicates repeated saves. The website can show results as they arrive; rating may remain pending until peer evidence arrives. No per-duel upload interaction or mandatory reload after every match. A player may batch an entire fight night.

The addon cannot detect whether the companion is currently running through SavedVariables alone. Selecting companion mode is a preference, not a heartbeat. Never show a live Connected/Uploaded badge based on that preference or on clicking reload. Live upload status belongs in the companion and website.

### Manual diagnostic and recovery flow
**Copy results** opens a selectable export string with focus and Ctrl+C guidance; do not assume WoW can write the operating-system clipboard. Offer a selectable website address rather than assume the addon can launch a browser. Export from memory, include queued losses as well as wins, and do not ask for score transcription.

On the website, Import results is an Advanced / Recovery account action. Paste -> preview account/characters and report count -> Import. Never display or accept a submitted character name as ownership proof. Reuse sign-in; preserve the pasted batch across a sign-in redirect in session-scoped storage with a short expiry, clear it on completion/cancel, and never put it in URLs or analytics. A mismatched account gets an actionable correction, not silent reassignment.

Respect the protocol's 25-report and byte limits. Split large sessions into deterministic numbered batches, remembering progress. After import, show accepted/already received/needs attention counts and individual pending reasons; duplicates are harmless. Offer file import as an advanced fallback with the same size/parser rules. Manual export is an exceptional recovery mode; evidence submitted this way is not inherently less trustworthy, but routine player uploads are not the release UX.

### Returning ratings to the addon
Uploading and downloading are separate. MVP uses an explicit website-generated **Copy addon update** bundle, pasted into the addon's **Import update** field. This can combine report receipts, current ratings, placement progress, and allowed configuration in one action. Refreshing this snapshot is optional for continued practice and does not change server authority.

Server snapshot includes schema version, issued time, generation ID, account-scoped character IDs, ladder/pool/season IDs, ratings, placement progress, and per-report receipt IDs/nonces/digests/statuses. It contains no OAuth tokens or upload credentials. Use a separately tagged, bounded canonical envelope with strict validation; never eval Lua. A corrupt/mismatched bundle leaves the existing snapshot intact. Do not imply an imported snapshot is cryptographically authenticated until an actual signature verifier is implemented and tested. Untrusted imports must never establish ownership, sanction anyone, or alter authoritative rating.

Display **Last known rating · updated [time]**; opening local result history must not fabricate an official post-match delta. Website/companion show current server results. Hide stale local numbers from any decision that requires current eligibility; the server validates that decision. Snapshot generation IDs are opaque and may change after replay, so compare server-issued monotonic snapshot sequence numbers within the same account scope to prevent accidental rollback, not lexicographic generation order. A sequence is freshness metadata, not authenticity proof.

Do not clear evidence merely because the user exported, reloaded, or imported an unsigned receipt. A matching imported receipt may mark a local display as reported, but retain the report under the normal bounded retention policy; display status is not a deletion authorization. Companion has its own server-acknowledged upload ledger. Re-upload is safe.

For MVP, the companion remains read-only with respect to game files. No promise that one reload both uploads a new match and loads its freshly recalculated rating. A later automatic inbound bridge is a separate researched feature; never overwrite loaded SavedVariables or race WoW's saves to make it appear seamless.

### Status language and recovery
Distinguish **Recorded locally**, **Saved for upload**, **Received by website**, **Awaiting opponent**, **Under review**, and **Rated**. Each surface shows only states it can actually know. After startup the addon can recognize previously persisted report IDs; any upload/rating state is explicitly from its last imported snapshot. Do not label a pending match Failed just because the opponent has not synced.

Local counts mean **Not yet acknowledged here**, not a guaranteed number missing from the website. Companion/server acknowledgments can precede the next imported snapshot. Explain that once in the Sync panel, not on every result card.

Companion failures retain the queue and show a single actionable reason: offline (automatic retry), sign-in expired (reconnect), path moved (choose folder), or unreadable file (retry/help). No toast for every successful match and no nags during combat. Provide manual export from every recoverable sync error. Website offers Copy addon update after import and from the player page; server completion does not require copying it back.

No automatic /reload, input injection, memory access, packet interception, hidden IPC, or background modification of running game files.

### Early scope
Small Windows-first optional uploader; select path, browser pairing, status, pause, bandwidth cap, retry, revoke/uninstall. macOS after proof.
Choose mature packaging framework after a file-watch spike; open source and reproducible checksums. Code signing when practical; do not instruct disabling OS protections.
No bonus rating or tactical advantage for installing it.

### Data handling
Allowlist only the addon's selected SavedVariables files. No recursive upload of WTF/account directories.
Parse constrained Lua table data; never eval/load/execute the file.
Debounce, stable-size check, atomic parse, retry incomplete writes, dedupe nonce/digest, resume offsets, handle rotation.
Revocable account-bound reporting credential in OS credential store. Scope permits report submission and reading only its own upload receipts/processing status; no moderation, rules changes, character claims, or identity privileges. The website remains the place for full account management.
Do not write game files while WoW runs. Manual receipt/config import until a documented safe inbound bridge is proven.
Upload success in helper does not instantly update the offline addon.

### Optional disk combat-log experiment
A user-enabled ordinary on-disk combat log may allow continuous evidence upload if supported on Forever. Probe separately from Lua event access.
It may lack contract/winner metadata and cannot be assumed a complete report.
Not a method for reconstructing intentionally hidden data. Use only permitted exposed data, evaluate after combat, no tactical overlay or automation.
Ship only after policy/data/privacy/flush behavior review.

### Evidence origins
Direct website/helper uploads authenticate the enrolled player's report.
Either side may carry a peer record; that alone does not authenticate the peer.
Early lab work must test per-install enrolled report-signing keys so either participant or an opted-in relay can carry both statements. Production promotion requires reviewed crypto, identity enrollment and revocation, complete match/outcome binding, conflict handling and measured runtime cost. Keys can authenticate origin. Keys are extractable and signatures do not prove honest gameplay. No global addon secret.
Until signing is independently reviewed, require each participant's authenticated batch or referee corroboration.
Never punish merely because sync is delayed; missing evidence expires unrated unless a valid adjudication exists.

### Outbox
Preserve unsynced records; warn at size limits and offer export. Stop new ranked capture only if storage is unsafe, not silent deletion.
Compress bounded batches; retry with backoff and pause on metered/slow connections. Honest clients include losses, not a wins-only upload menu.

## Combat-log and item-detection engine

### Source-backed boundary
Local source snapshot: Gethe/wow-ui-source, commit 70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e, build 1.60.1 (69913).
CombatLogDocumentation.lua declares COMBAT_LOG_EVENT and COMBAT_LOG_EVENT_UNFILTERED with HasRestrictions=true; C_CombatLog.IsCombatLogRestricted() exists.
ChatInfoDocumentation.lua declares C_ChatInfo.SendAddonMessage with SecretArguments=NotAllowed and documents InChatMessagingLockdown().
DuelInfoDocumentation.lua declares DUEL_FINISHED without winner payload.
These declarations were inspected, but no in-client test was run. Presence is not permission or reliable payload proof.

### Pipeline
Blizzard event adapter -> availability/secret check -> normalized fact -> bounded match buffer -> post-game detector -> evidence/coverage -> server reconciliation.
Detect only non-secret readable fields; never stringify, compare, serialize or reconstruct secret values.
Do not assume storing a secret now makes it readable after combat. If observation was unavailable, retain the coverage gap, not the secret.
Defer interpretation/peer synchronization until permitted after combat. This is match administration, not coaching.

### Facts
match_id, game_index, observer_id, observation_sequence, relative_ms, optional server_time, source_guid/owner_guid, target_guid, spell_id, item_id if actually known, event_kind, phase, availability, adapter_version.
Separate observed identifiers from inferred item association.
Only enrolled match subjects plus minimal interference classification; redact unrelated chat and private world data.
Bounds: 2 MiB volatile ring per active series and 5000 normalized relevant facts; on overflow mark coverage partial. Export cap is lower; compact to decisive facts and gap intervals, never silently claim complete.

### Item/effect catalog
Version by game build. Entries map item IDs to use spell IDs/aura/heal/damage/summon effects, category, triggered variants, pet ownership, allowed class lookalikes and confidence.
Two items can share an effect. A heal/aura is not proof of which item was used.
A received buff is not proof the recipient activated an item.
Known external source can support interference; unknown source cannot prove solo/clean.
Pin provenance and tested fixtures; unknown IDs go to catalog review, not automatic ban.
No blanket inference from inventory change, cooldown, animation, or health delta alone.

### Detector output
rule_id, status (pass_observed / violation_candidate / corroborated_violation / unknown / not_applicable), evidence_refs, coverage, ambiguity_reasons, proposed_action.
pass_observed means only the monitored interval passed.
A candidate becomes a ranked sanction only with sufficient independent authenticated evidence or referee ruling.
Detection confidence and result verification are separate dimensions.

### Required fixtures
Known potion use; allowed class heal with same-looking output; bandage allowed; engineering effect; allowed trinket; external heal; self buff; pet damage/ownership; outsider pet; aura applied before Ready; between-round drink; unknown effect; secret payload; log disabled; buffer overflow; timestamp skew; duplicate event; translated client.
Each fixture states expected finding AND coverage.

### Diagnostics UI
Show “Monitoring potion effects: available” or “Unavailable in this combat context—attested rule.”
Post-match timeline shows effects/rules/source and evidence origins, never tactical live suggestions.
A false positive is more harmful than a missed flag: unknown is a legitimate outcome.

## Make it feel like a community

### The first night
Recruit 12–20 players if possible, include newcomers and several classes, pick one faction hub, name a volunteer host.
20-minute casual warmup, 45-minute open challenges, an eight-player mini cup, then unlimited rival rematches.
Advertise exact rules and monitoring limitations. Gather three questions afterward: Was it easy? Was the result fair? Would you return?
No daily quest list or reward for hours spent online.

### Features worth building early
- Rematch: same preset, both consent, clear next rating weight.
- Rivals: head-to-head history, close series, “run it back” invitations with mute/block.
- Fight Passport: played classes, venues and events, personal bests. Practice can count toward noncompetitive exploration.
- Match cards: shareable result/rules/series graphic generated from public approved data.
- Rookie tag: voluntarily show learning/practice interests; no public skill insult.
- Mentor sessions: practice-only, helpful endorsements, no rating farming.
- Class nights: bring Mirror opponents together instead of creating an empty always-on queue.
- House rules night: engineering/consumable theme using custom presets.
- Most improved stories: voluntary season progress highlights, not a gameable Elo bonus.
- Crowns/trophies: commemorate scheduled events without pretending every title is world-best.
- Guild fight night: easy invitations, shared roster, exhibition scoreboard.

### Progression
Separate skill (Elo), achievements (passport), community appreciation (endorsements) and chaos (Pit/War).
No endorsement affects rating or report validity.
Avoid kill-only “support” badges if healer/assist evidence is absent. Event hosts can award plainly subjective sportsmanship acknowledgements.

### Lightweight content
Website home prioritizes upcoming events and familiar faces.
Allow optional player-submitted match stories/screenshots with consent and basic moderation.
No full replay promise from an incomplete combat log.
Caster package uses public bracket/fight cards and permitted post-match stats only.

### Respect everyone's time
Quiet by default; decline without penalty; no daily streak loss; no public quitter/cheater score.
Organizers can cancel with a clear message.
Keep hosting templates simple enough for an ordinary guild member.
Free software and transparent costs. Any later donation is optional and never buys rating, visibility, moderation access, or combat information.

## Two-developer beta lab and automatic sync release gate

### Product decision — v2.2
Assume Forever uses the retail-style addon sandbox and APIs as the implementation baseline. This is a working assumption, not live verification or a promise that every retail function exists. Detect build and capability differences; preserve the restricted-data boundaries. No arbitrary HTTP, sockets, or general file writes from addon Lua are assumed.

Automatic delivery is the normal product requirement. Routine copy/paste reporting is not an acceptable public ranked experience. Manual export/import is for developer diagnostics, recovery, and exceptional unsupported setups only. This supersedes earlier v2.1 language describing manual upload as an equal primary onboarding path. The companion is optional for an individual only if another enrolled participant or available relay can reliably carry their authenticated report. If no automatic carrier exists, show Local/practice recording; do not misleadingly advertise automatic ranked submission.

First users are the owner and co-developer. Deliver a runnable test kit before investing in a polished production transport. Website work can proceed against fixtures. The agent must implement tests and record unknowns; it cannot perform the two humans' live-client experiments itself.

### Initial deliverables
1. Instrumented Lua probe addon with a Test Lab panel, build/capability summary, scenario checklist, bounded diagnostics, automatic journal, and crash-safe pending outbox.
2. Windows companion prototype: explicit path consent, safe SavedVariables parser, allowlisted log tailer behind a lab toggle, local spool, automatic upload/retry, live status, and session health summary. No game-memory access or game input automation.
3. Local or low-cost hosted test backend with two separate accounts, device enrollment/revocation, ingestion, receipt status, reconciliation, shadow rating, and fixture download. Secrets stay out of addon logs.
4. Lab dashboard correlating each tester's observations, file arrival, server receipt, mismatch and rating state by session ID. Automatically assemble the test report; testers should not transcribe match outcomes into forms.
5. Proven crypto candidates and timing fixtures. Separately assess a vetted Lua-capable public-key signature implementation and companion-assisted enrollment. Never invent cryptography to meet a deadline. If viable key protection or runtime performance is insufficient, record the limitation rather than claiming two signed origins.

### Two-person setup
Tester A and B use independent game accounts and independent app identities on separate machines. Start same faction/realm with an ordinary duel. Swap winner and uploader roles. Later use eligible alternate characters for cross-faction and level-context tests; report blocked scenarios when characters or access are unavailable. Do not count a fixture as a live pass.

Record exact client build, addon/companion version, OS, installation path category, faction, realm, readable character identity, group state, zone and allowed context. Keep personal paths/account identifiers private and redact shared diagnostics.

### Experiment matrix
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

### Evidence and test execution
Run a minimal smoke pass first to eliminate impossible transports. For surviving routes, run at least 10 repeats of each key delivery/recovery case, swapping A/B; expand outcome/rules cases per docs/02 (30 controlled cases per critical family, 100 varied series before ranked review). These counts are engineering gates, not proof of perfect reliability.

Log local monotonic durations and server receive times separately; do not calculate one-way latency by subtracting unsynchronized wall clocks. Track end-of-duel -> local complete report -> file availability -> server receipt -> corroboration -> rating commit, with unknown stages explicitly missing. Publish sample count, median/p95 where meaningful, maximum, loss/retry counts and human actions. Online stable-session design target is zero per-match player actions; if a live bridge exists, target p95 receipt within 15 seconds after complete reports are available, then revise based on measurements. Do not claim this target is met before testing.

Each test stores expected outcome, actual result, build/context, permitted redacted trace, tester, repeat count, capability status and reproduction steps. Test Lab emits an automatic session bundle through the companion; manual export is available if the bridge itself fails. A failure ledger records impact, recovery, owner and retest status.

### Transport selection after experiments
Preferred: permitted low-latency file/log transport plus companion, complete signed participant evidence, automatic retries. Raw combat logs alone cannot stand in for authenticated match agreement/outcome.

Fallback: SavedVariables plus companion, one voluntary safe reload between fights or at session end. No per-match reload requirement. Describe this as automatic upload after save, not real-time sync. If this is the best supported route, review the measured UX with the two developers before public ranked release.

Coverage improvement: either participant can carry both reviewed, independently enrolled signatures; opted-in community relays may carry the same package. The relay supplies transport, not independent gameplay corroboration. No shared signing secret, forged second origin, or elevated trust merely for using a companion.

If signatures are not ready, each participant needs their own authenticated automatic submission, or a legitimate referee ruling. A single uncorroborated report never becomes a ranked win just because its opponent stays silent. If no permitted automatic route works, keep the recording/practice build useful and pause public ranked release rather than turn routine manual imports into the product.

### Inbound rating freshness
Website and companion can always display the latest backend result when online. An addon snapshot is dated until a proven inbound route exists. Investigate server-signed snapshots carried by a legitimate in-game peer whose client has actually received them, but do not assume the first peer has an internet bridge. Test signature verification, origin, replay, stale generation and account scope.

A separate companion experiment may stage public snapshot data only after the selected game client is fully closed, with explicit consent, backups and next-login verification. It is not a live bridge and does not justify overwriting active SavedVariables. This is disabled by default and outside the read-only production MVP until separately approved in the design review. No automatic second reload, fake instant refresh, browser automation, screen encoding, or restricted-data workaround.

### Exit report and decision
Deliver supported/partial/failed/unknown matrix, selected primary/fallback transport, setup instructions, measured UX, known missing evidence, automatic delivery coverage and next-build fixes. Keep raw records private and attach shareable redacted fixtures.
Public ranked release requires reliable automatic reporting for its advertised supported setups, independent origin verification, durable recovery, server idempotency, clearly dated in-game ratings, and working restrictions-aware outcome detection. Require both developers to complete the normal loop without copy/pasting results. Practice and website features may ship earlier.
