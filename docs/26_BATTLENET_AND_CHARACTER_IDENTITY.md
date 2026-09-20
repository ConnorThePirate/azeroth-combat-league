# Battle.net linking and character ownership

## Confirmed public capability
Blizzard's discovery endpoint exposes authorization, token, userinfo, issuer and JWKS URLs:
https://oauth.battle.net/.well-known/openid-configuration
Checked 2026-09-19. Discovery is not proof every advertised grant/scope is available to a new third-party client.
Official portal: https://develop.battle.net/documentation/battle-net/oauth-apis
The portal/profile documentation could not be retrieved during this review. Forever character ownership API support is unconfirmed. No authenticated Blizzard request was performed.

## Model
Internal platform account -> private provider identity -> character claims.
Key provider identity by validated issuer + subject/account ID. BattleTag is display data, not a stable primary key.
One provider identity maps to one competition account. Reconnection preserves history.
BattleTag private by default; public identity uses character/display name.
OAuth proves account control, not unique human, subscription count, or untampered addon.

## Implementation
Use Supabase app authentication plus server-side Connect Battle.net adapter. Do not assume a native Supabase Battle.net provider exists.
Primary Battle.net login can be added once supported session integration is demonstrated; same stable mapping, no duplicate account creation.
Authorization-code flow, registered redirect allowlist, single-use state bound to initiating app session; PKCE when supported by the registered client.
Provider secret/token exchange on server only. Validate userinfo/identity; validate issuer/audience/signature/nonce if using ID tokens.
Minimum scopes; character-profile scope only if an actual Forever ownership route is documented and tested.
Retain encrypted provider tokens only as required. Never send them to addon/helper.
Reauthentication for linking/unlinking; never merge accounts by matching email or BattleTag.
Private provider IDs never appear on public profile APIs.

## Character tiers
claimed: self-reported, practice.
witnessed: volunteer verifies fresh server challenge from the actual in-game character; record witness, time, realm/build and evidence.
provider_verified: official supported ownership response binds that character to authenticated account.
An exported code from an editable addon alone is not character proof.
Prefer readable stable GUID plus game product/environment; preserve name/realm aliases and rename/transfer history. If only name is available, label identity weaker and require re-verification on reuse.
Beta/live identities separate. Deleted/recreated characters need re-verification.

## Test task
Register app; authorize a consenting tester; inspect documented owned-character route for exact Forever namespace/identity. Save redacted response fixture, endpoint, scopes, freshness, failure states.
If unavailable, use witnessed beta enrollment and keep functionality working.
Practice needs no Battle.net; ranked beta requires connection plus witnessed/provider tier. Private custom events can accept claims without global rating.
