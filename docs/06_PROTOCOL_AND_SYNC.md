# Protocol v2 and sync

Schema IDs: wf.match-contract.v2, wf.match-report.v2, wf.sync-envelope.v2.
Addon prefix WFCPVP2. Major versions must match; optional minor capabilities are negotiated.
Hash/checksum means integrity of bytes, NOT identity or game truth.

## Canonical bytes
Restricted JSON: ASCII object keys sorted lexically, UTF-8 string values preserved exactly, no Unicode normalization transformations, integers in safe range only, arrays ordered, booleans/null standard, no whitespace, duplicate object keys rejected.
Use a specified JSON string escaping implementation shared by golden fixtures. Names are display values; UUIDs/GUIDs are identity.
Compute SHA-256 of canonical bytes with reviewed libraries. No ad-hoc substitute hash.
Do not include display strings that each client independently localizes in the contract hash.
Round timestamps to integer milliseconds before serialization; never hash floats.

## Contract example
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

## Messages
HELLO: version, build, capabilities, session nonce.
OFFER/COUNTER: full proposed contract.
ACCEPT: contract hash and sender slot.
READY: readiness and readable checks/coverage.
OBSERVATIONS/FINISH: bounded post-combat report facts.
CONFIRM: exact outcome/contract attestation.
CANCEL, ACK, NACK: administrative control.
Never require in-combat delivery. START is a local observation, not a mandatory combat-time network message.

## Transport defaults to prove
200-byte maximum frame including header; lower further if live client testing requires.
Header fields: major, session short ID, message ID, sequence, chunk index/total, payload checksum. Chunk data printable base64url.
Maximum logical peer message 16 KiB, <=256 chunks, <=4 concurrent assemblies per sender. Assembly expires after 30 seconds with no progress or 180 seconds total; this allows a full payload at the default throttle.
Initial token bucket 4 frames/second, burst 8; obey actual client throttle/error status.
ACK complete message; after the last frame, retry missing-frame requests at 2/5/10 seconds only out of lockdown. Resend missing chunks rather than the whole message; then retain outbox and show status. Never interleave enough bulk reports to starve a contract/control frame.
Validate actual sender from game event against expected participant; body sender field alone is not trusted.
Deduplicate message ID+digest. Same ID/different digest rejects. ACK messages are not ACKed.
Do not broadcast full reports to general chat/custom public channels.

## Reports
Required: schema, sessionId, contractHash, originCharacterId, installationId, nonce, build, addonVersion, detectorCatalogVersion, lifecycle times, games[], coverage[], attestations[], peerDigests[].
Each game: index, observed start/end, claimed winner character or null, finish reason, evidence facts and interference/violation candidates.
Attestation references exact contract/outcome digest; report revisions append and supersede, never overwrite.
Pending reports may lack winner; they are evidence only and cannot rate.
Origin authentication comes from app/helper session or separately reviewed enrolled signature, not copied JSON.

## Export
WFP2:<base64url(raw-DEFLATE(canonical-json))>:<eight-hex-CRC32>
Choose raw DEFLATE only, no codec guessing. CRC is corruption detection, SHA-256 links content, neither authenticates a player.
Envelope decoded max 256 KiB; compressed max 128 KiB; max 25 reports. Reject excessive depth (>16), overlong strings (>4096 bytes except explicitly bounded payload), duplicate JSON keys, or decompression over limit.
Batch parsing yields per-item accepted/duplicate/rejected/awaiting results; malformed envelope fails wholly.
SavedVariables is parsed as data, never executed.

## Website-to-addon snapshot
Schema wf.addon-update.v1; envelope WFU1:<base64url(raw-DEFLATE(canonical-json))>:<eight-hex-CRC32>. Same 128 KiB compressed/256 KiB decoded, depth and string limits as report export; distinct tag prevents importing results as config.
Required: accountId, snapshotSequence (positive safe integer), issuedAtMs, schema, characters[], receipts[], configVersion. Character entries include characterId and ladder snapshots with seasonId/poolId/ladder/ratingMilli/placement progress/generationId. Receipt entries identify installationId, nonce, bodyDigest, receiptId and processing status. Limit to 25 receipts per bundle and 100 ladder snapshots; page receipts using the website cursor and one newly issued sequence per bundle. Show remaining pages, allow optional later import, and upsert only included records; absence never deletes or resets a rating/receipt.
Server allocates account-scoped monotonic sequence atomically and reads rating rows from each season's committed generation. Addon rejects unsupported schema, account mismatch, malformed fields and older/equal sequence (equal can report Already imported). A newer page must not erase earlier pages. Export no secrets. Imported data is a last-known display snapshot, not authoritative eligibility or ownership proof; CRC/hash is not authentication. See docs/27 for retention and trust limits.

## Server behavior
Deduplicate account+installation+report nonce; conflicting reuse rejects.
First accepted report assigns first_seen_at/receipt_seq. Contract hash never replaces session identity; conflicting hashes for same session are quarantined together.
Acceptance expiry applies to acceptance/start, not later upload. Upload clocks follow 07.
Server receipts/config are authenticated by app TLS; imported config trust must not be described as cryptographic unless a real verified signature exists. Keep ranked authority on server.
Cross-faction fallback uses website session enrollment/referee when direct comms fail. Six-character code is only a rate-limited rendezvous hint, never authorization.
