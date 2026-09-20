# Sources and limits of verification

Review date 2026-09-19. Public web documentation and local source inspection are not live-client testing.

## Blizzard identity
Verified public discovery response:
https://oauth.battle.net/.well-known/openid-configuration
Includes issuer, authorize/token/userinfo/JWKS endpoints. This supports account linking; not proof of character ownership.
Official OAuth portal: https://develop.battle.net/documentation/battle-net/oauth-apis
Classic profile portal: https://develop.battle.net/documentation/world-of-warcraft-classic/profile-apis
Portal/profile pages could not be retrieved during this revision. No authenticated Forever ownership test performed.

## Client source
Inspected local checkout commit 70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e (1.60.1/69913).
Snapshot: https://github.com/Gethe/wow-ui-source/commit/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e
Duel: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/DuelInfoDocumentation.lua
Combat: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/CombatLogDocumentation.lua
Chat: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/ChatInfoDocumentation.lua
Unit: https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua
New online branch retrieval was unavailable; the identified local commit was re-inspected. Do not market this as a live latest-build certification.

## Hosting/operations
https://supabase.com/pricing
https://supabase.com/docs/guides/database/functions
https://supabase.com/docs/guides/functions/limits
https://supabase.com/docs/guides/auth/auth-smtp
https://developers.cloudflare.com/pages/platform/limits/
Provider limits can change; check before provisioning.

## Rating
Glicko-2 reference reviewed: https://www.glicko.net/glicko/glicko2.pdf
v2 intentionally does NOT implement Glicko-2. Community Elo parameters/repeat policy are original product decisions specified in 09 and tested in reference code. They are not attributed to Blizzard or claimed optimal without beta evidence.

## Community ideas
Rookie/class nights, fight cards, rivals, passport and scheduled hunts are design recommendations. This revision did not conduct a new representative forum survey.
Original plan's forum ideas are qualitative inspiration, not proof of universal demand or technical feasibility.

## Pending verification
Live client outcomes, combat visibility, item catalog correctness, helper flush timing, third-party OAuth app behavior and Forever ownership all need human/configured integration tests.
