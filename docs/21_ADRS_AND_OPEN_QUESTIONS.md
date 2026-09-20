# Decisions and open questions

## Accepted v2 decisions
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

## Open client questions
Exact winner/start signals for all duel termination paths.
Readable combat-log and aura fields by context/build.
Cross-faction transports and throttles.
Actual SavedVariables/disk-log flush behavior.
Official Forever ownership namespace/endpoint availability.
Native arena queue availability and full rosters/results.
Precise hub area IDs; layer co-location checks.
These need fixtures and testers, not guesses. Disable only affected capabilities.

## Open community choices
Final name/art style, launch region/realm, trusted initial witnesses, Standard class-created item catalog, first weekly fight-night time.
Defaults in specs allow coding now. Do not block the whole build on branding.

## ADR template
Title, status, date, context, decision, alternatives, player impact, integrity/privacy impact, migration/rollback, fixtures and owner.
Algorithm/rules changes need a published version. No silent mid-season arithmetic changes.

## ADR — v2.2 automatic delivery and retail baseline
Accepted product decision: assume retail-style addon APIs as the starting point and validate all relied-on behavior in the two-developer lab (docs/30). Manual result import is diagnostic/recovery only. Move companion and independently enrolled signed-receipt experiments into the first builds; one uploader may carry two authenticated origins only after crypto and transport gates pass. No-carrier sessions remain local/practice, and silence never authenticates an opponent. Public ranked release needs a measured automatic delivery path; no promise of live sync or automatic inbound rating until tested.
