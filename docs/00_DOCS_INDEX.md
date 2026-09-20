# Documentation Index and Ownership

Each topic has one canonical document. Link to it instead of duplicating logic.

| File | Canonical subject |
|---|---|
| `01_PRODUCT_REQUIREMENTS.md` | vision, personas, modes, requirements, non-goals |
| `02_RELEASE_SCOPE_AND_FLAGS.md` | release boundaries and capability flags |
| `03_USER_FLOWS.md` | end-to-end player, organizer, and moderator journeys |
| `04_API_FEASIBILITY_AND_PROBES.md` | current client evidence and mandatory beta tests |
| `05_ADDON_ARCHITECTURE.md` | addon modules, saved variables, UI, event handling |
| `06_PROTOCOL_AND_SYNC.md` | addon messages, contracts, reports, export/import envelopes |
| `07_MATCH_STATE_MACHINE.md` | legal states, transitions, timeouts, reconciliation |
| `08_RULESETS_AND_ENFORCEMENT.md` | official and tournament rules, enforcement confidence |
| `09_RATING_LEADERBOARDS_AND_ANTI_ABUSE.md` | exact Community Elo, examples, repeat limits, replay and titles |
| `10_WORLD_PVP_AND_GURUBASHI.md` | opt-in War Score, Pit, bounties, privacy |
| `11_TOURNAMENTS.md` | formats, permissions, brackets, reporting |
| `12_WEBSITE_UX.md` | information architecture, pages, component states |
| `13_BACKEND_ARCHITECTURE.md` | services, boundaries, background work, idempotency |
| `14_DATABASE_SCHEMA.md` | tables, constraints, indexes, retention, RLS |
| `15_API_CONTRACTS.md` | HTTP/function endpoints and errors |
| `16_SECURITY_PRIVACY_AND_MODERATION.md` | threat model and operations |
| `17_INFRASTRUCTURE_AND_DEPLOYMENT.md` | $0 beta stack, environments, backups, scaling |
| `18_TESTING_OBSERVABILITY_AND_RUNBOOKS.md` | test pyramid, metrics, alerts, incident playbooks |
| `19_IMPLEMENTATION_ROADMAP.md` | epics, dependencies, milestones, estimates |
| `20_ACCEPTANCE_CRITERIA.md` | release gates and testable definitions of done |
| `21_ADRS_AND_OPEN_QUESTIONS.md` | locked decisions, templates, unresolved choices |
| `22_GLOSSARY.md` | shared terms |
| `23_SOURCES.md` | primary technical and infrastructure references |
| `24_SEED_DATA_AND_UI_COPY.md` | development fixtures and canonical user-facing language |
| `25_ENGINEERING_SETUP.md` | monorepo tooling, dependencies, commands, and environment variables |
| `26_BATTLENET_AND_CHARACTER_IDENTITY.md` | OAuth linking versus character ownership |
| `27_AUTOMATIC_RECORDING_AND_UPLOADER.md` | automatic recording, file bridge and evidence origins |
| `28_COMBAT_LOG_DETECTION.md` | restricted API adapters, item catalog and coverage |
| `29_COMMUNITY_FUN_AND_EVENT_PLAYBOOK.md` | fight nights, rivals, passport and community rituals |

| `30_TWO_DEVELOPER_BETA_LAB.md` | first test builds, automatic sync decisions and failure matrix |

## Version policy

- Product protocol version: `2`.
- Match contract schema: `wf.match-contract.v2`.
- Match report schema: `wf.match-report.v2`.
- Sync envelope schema: `wf.sync-envelope.v2`.
- Rating algorithm: `community-elo-1`; v2 handoff intentionally replaces v1 Glicko/escrow design.
- Executable reference: `../reference/rating.mjs` and `../reference/rating.test.mjs`.
- Breaking changes require a new schema ID and compatibility window.
- Documentation changes that alter integrity behavior require an ADR.

## Status vocabulary

- `locked`: implement as written.
- `beta hypothesis`: implement behind a flag and measure.
- `blocked`: do not implement until its gate is satisfied.
- `future`: design for compatibility but do not build now.
