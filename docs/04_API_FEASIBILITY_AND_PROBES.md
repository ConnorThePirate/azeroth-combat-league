# API evidence and live probe plan

## Working assumption
Use the retail-style addon system as the development baseline at the user's direction. Exact Forever behavior must be measured. Execute 30_TWO_DEVELOPER_BETA_LAB.md with the owner and co-developer; absence of a live result is unknown, not pass.

## Proven source versus untested runtime
Re-inspected local Gethe/wow-ui-source snapshot:
commit 70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e, build 1.60.1 (69913), dated 2026-09-18.
This is the snapshot available for review, not a claim that no newer beta exists.
No game client, player credentials, authenticated character API, or live network transport was tested here.

## Source findings
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

## Probe matrix
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

## Records
capability, build, context, status (observed_source / tested_pass / partial / fail / unknown), timestamp, sample count, false-positive/negative examples, coverage gaps, fixture path, tester.
Production flags require tested evidence. Do not use pcall as permission to operate on secret values.
Official API absence or access restriction blocks that detector only. Website/custom/practice functionality continues.
