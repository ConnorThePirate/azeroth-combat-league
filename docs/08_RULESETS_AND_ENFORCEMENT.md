# Configurable rulesets

Create, save, share and choose presets in addon and website. Common presets are quick; advanced controls remain available. A capable agent should implement the builder, not only a fixed ban list.

## Templates
Ranked Standard: class abilities/self buffs and bandages allowed. Active-game potions, elixirs, flasks, world/external buffs and activated engineering prohibited. Class-created items require an explicit tested allowlist; unknown classification is attested/unavailable.
Pure Duel: class-only; no optional consumables or bandages.
Fieldcraft: declared consumables/engineering allowed.
Anything Goes: normal tools, no exploits or outside participants.
Custom: private/event settings including void-on-violation if desired.
Only the exact approved immutable Standard version rates globally. Custom events get their own standings, not a new global Elo ladder.

## Controls
Allow/deny category, item ID overrides, permitted effect IDs, quantity per game, buff source, equipment swap policy, activated gear, engineering, class-created items, pets, food/drink, rest time, game timeout, best-of, interference/disconnect rules.
No user-supplied executable Lua.
Precedence: item exception > category > template.
Distinguish equipped/possessed/used/received-effect restrictions. Unknown does not mean banned.

## Phase definitions
Preparation: normal food/drink allowed. Remove prohibited persistent buffs before Ready.
Ready: allowed gear/buff snapshot; policy-relevant changes clear readiness.
Active: apply active-game bans/counts.
Between games: normal food/drink/bandage allowed in Standard; no world/external buffs. Default rest 120 seconds; mutually extend up to five minutes. No claim of resetting cooldowns.
Series end: evidence review/result card.
Long cooldowns remain the game's mechanics. Tournament changes to rest/gear rules require pre-event publication.

## Detection and coverage
Observable: a tested detector can see relevant data in this context; not anti-cheat.
Corroborated: independent observations/referee support conclusion.
Attested: players confirm.
Unavailable: cannot evaluate now.
Coverage is recorded per rule, game, client and time interval.
No observed violation is not proof of a clean game.

## Consequences
Confirmed participant violation: default game loss, serious/repeated violations may disqualify series.
Unknown/ambiguous: review or attested result, no automatic loss.
Unavoidable outsider interference: restart/void affected game.
Coordinated interference: staff investigation.
Casual custom void-on-violation is permitted but clearly inappropriate for Standard ranked: a losing player must not escape by deliberately breaking a rule.
Never automatically forfeit from one editable client's claim.

## Rule schema
rule_id, ruleset_version, category, action (allow/deny/limit), item_ids, effect_ids, phase, count_limit, source_filter, detector_id/version, minimum_evidence, unavailable_behavior, sanction.
All published rulesets immutable and hash-addressed. Edits create versions and reset acceptance.
Before duel show preset differences and coverage. After duel show observed source/effect/time, rule, evidence origins and decision.
See 28_COMBAT_LOG_DETECTION.md.
