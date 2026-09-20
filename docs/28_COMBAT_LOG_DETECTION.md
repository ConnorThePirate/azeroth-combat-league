# Combat-log and item-detection engine

## Source-backed boundary
Local source snapshot: Gethe/wow-ui-source, commit 70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e, build 1.60.1 (69913).
CombatLogDocumentation.lua declares COMBAT_LOG_EVENT and COMBAT_LOG_EVENT_UNFILTERED with HasRestrictions=true; C_CombatLog.IsCombatLogRestricted() exists.
ChatInfoDocumentation.lua declares C_ChatInfo.SendAddonMessage with SecretArguments=NotAllowed and documents InChatMessagingLockdown().
DuelInfoDocumentation.lua declares DUEL_FINISHED without winner payload.
These declarations were inspected, but no in-client test was run. Presence is not permission or reliable payload proof.

## Pipeline
Blizzard event adapter -> availability/secret check -> normalized fact -> bounded match buffer -> post-game detector -> evidence/coverage -> server reconciliation.
Detect only non-secret readable fields; never stringify, compare, serialize or reconstruct secret values.
Do not assume storing a secret now makes it readable after combat. If observation was unavailable, retain the coverage gap, not the secret.
Defer interpretation/peer synchronization until permitted after combat. This is match administration, not coaching.

## Facts
match_id, game_index, observer_id, observation_sequence, relative_ms, optional server_time, source_guid/owner_guid, target_guid, spell_id, item_id if actually known, event_kind, phase, availability, adapter_version.
Separate observed identifiers from inferred item association.
Only enrolled match subjects plus minimal interference classification; redact unrelated chat and private world data.
Bounds: 2 MiB volatile ring per active series and 5000 normalized relevant facts; on overflow mark coverage partial. Export cap is lower; compact to decisive facts and gap intervals, never silently claim complete.

## Item/effect catalog
Version by game build. Entries map item IDs to use spell IDs/aura/heal/damage/summon effects, category, triggered variants, pet ownership, allowed class lookalikes and confidence.
Two items can share an effect. A heal/aura is not proof of which item was used.
A received buff is not proof the recipient activated an item.
Known external source can support interference; unknown source cannot prove solo/clean.
Pin provenance and tested fixtures; unknown IDs go to catalog review, not automatic ban.
No blanket inference from inventory change, cooldown, animation, or health delta alone.

## Detector output
rule_id, status (pass_observed / violation_candidate / corroborated_violation / unknown / not_applicable), evidence_refs, coverage, ambiguity_reasons, proposed_action.
pass_observed means only the monitored interval passed.
A candidate becomes a ranked sanction only with sufficient independent authenticated evidence or referee ruling.
Detection confidence and result verification are separate dimensions.

## Required fixtures
Known potion use; allowed class heal with same-looking output; bandage allowed; engineering effect; allowed trinket; external heal; self buff; pet damage/ownership; outsider pet; aura applied before Ready; between-round drink; unknown effect; secret payload; log disabled; buffer overflow; timestamp skew; duplicate event; translated client.
Each fixture states expected finding AND coverage.

## Diagnostics UI
Show “Monitoring potion effects: available” or “Unavailable in this combat context—attested rule.”
Post-match timeline shows effects/rules/source and evidence origins, never tactical live suggestions.
A false positive is more harmful than a missed flag: unknown is a legitimate outcome.
