# API contracts

Implement versioned trusted functions plus RLS-safe reads. Agent generates OpenAPI 3.1 and executable JSON Schemas from these requirements.
Base /v2; JSON UTF-8, integer timestamps or ISO UTC at external display boundaries; UUID identities.
Every authenticated mutation needs idempotency key except OAuth callback, which uses one-use state.

## Routes
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

## Ingest request/response
Input: encoding enum raw-deflate-base64url, envelope string, optional declared schema; transport may also accept decoded JSON with same caps.
Output: requestId, receiptId, items[{nonce,status,matchId,reasonCodes}], serverTime, configVersion.
Status: accepted, duplicate, rejected, awaiting_peer, corroborated, disputed, rating_pending.
Do not promise immediate rank application inside upload request.
Each item's origin must authenticate independently. Receiving two report bodies from one uploader isn't two authenticated people.

## Errors
error:{code,message,requestId,retryAfterSeconds?,fieldErrors?}.
401 unauthenticated, 403 forbidden, 404 not found, 409 idempotency/state conflict, 413 too large, 422 validation, 429 throttled, 503 temporarily paused.
Reason codes: hash_mismatch, duplicate_origin_nonce, outcome_conflict, coverage_unknown, identity_unverified, pair_zero_weight, wrong_bracket, expired_config, unsupported_build, missing_peer, referee_ruling.

## Limits
Default upload 256 KiB decoded/128 KiB compressed, 25 reports, 10 requests/minute/account with burst 3.
Allow retry without creating new evidence; backoff on 429.
Cursor/ETag for public pages; no-store on private identity/config receipt/codes.
Private event invite code is an enrollment hint; membership ACL enforces actual access.
