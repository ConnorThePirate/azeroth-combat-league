# Coding agent kickoff

Build the community PvP platform in this folder. Read AGENTS.md and the canonical subsystem documents. v2 replaces the previous Glicko/escrow design.

First delivery is the runnable test kit in docs/30_TWO_DEVELOPER_BETA_LAB.md, for the owner and co-developer. Assume retail-style APIs, verify every relied-on behavior, and report failures. Automatic upload is normal UX; manual export is diagnostics/recovery only.

Implementation components:
1. Scaffold web, addon, local Supabase, shared schemas, and focused CI.
2. Implement the capability probe and a small automatic duel recorder.
3. Port the exact Community Elo v1 reference into packages/rating; retain golden/property tests.
4. Implement server-side Battle.net account connection. Probe documented Forever ownership support; never invent the endpoint.
5. Complete one duel flow: contract -> capture -> result -> automatic bridge -> authenticated evidence -> reconciliation -> shadow rating -> match/profile.
6. Build a useful rules editor and detection timeline using known/unknown fixtures.
7. Build both sync paths in docs/27: read-only companion plus safe Save results & reload, and recovery-only Copy results -> website import. Prioritize single-uploader signed peer receipts and permitted live-log experiments. Measure beta reload flush; preserve whole-session batching and error recovery.
8. Implement optional Copy addon update -> Import update for receipts and last-known ratings. Never claim outbound upload automatically refreshes the addon. Validate normal automatic delivery and exceptional recovery separately with both developers.

Then proceed through docs/19_IMPLEMENTATION_ROADMAP.md.
Build independent website features while in-client tests are pending.
Keep practice available when a ranked capability is unavailable.
No monetization or startup machinery. Fun, low friction, transparent results, and volunteer maintainability are the goals.
