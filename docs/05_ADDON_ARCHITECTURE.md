# Addon architecture

## Layout
Bootstrap.lua; Core/{Events,State,Capabilities,Diagnostics}; Domain/{Contract,Series,Rules,Identity};
Adapters/{Duel,CombatLog,Aura,Inspect,Map,PvPMatch}; Comms/{Codec,Transport,Reliability};
Sync/{Outbox,Export,Import}; UI/{Challenge,Result,RulesEditor,History,Hub,Event,Settings}; Locale; Tests.

## Flow
One event dispatcher -> readable normalized facts -> bounded domain state -> UI presentation.
Adapters isolate Blizzard-specific API differences. No protected gameplay actions, high-frequency enemy scans, or secret-value coercion.
Record observations where permitted; defer interpretation/sync until after combat if required.
Outcome inference is versioned and evidence-backed; no winner inferred just because target health is low.

## SavedVariables
schemaVersion, installationId, settings, publicIdentityBundle, capabilities, contracts, reports, outbox, receipts, diagnostics.
Installation ID isn't proof of a person. Never store OAuth/access/service credentials.
Keep 100 acknowledged completed reports by default; unsynced records are preserved beyond that threshold with storage warning/export.
Bound diagnostics to 500 redacted entries.
Migrations preserve prior schema backup and do not erase unsynced evidence.

## UI
Challenge, Matches, Rules, Hub, Events, Sync, Settings.
Compact combat display: static contract/series score and permitted timer only.
Post-match card: outcome, monitoring coverage, flagged issue, Confirm/Report problem/Rematch.
Remember presets, show changes, require mutual consent.
Quiet mode suppresses unsolicited hub/event notifications.

## Hub and event data
Hub presence uses tested local addon transport and short expiry; not website-driven live global matchmaking.
Layer labels are player-provided/visibility-tested; no invented layer API.
Event/rating website data is imported snapshot unless a safe supported update route is demonstrated.

## Build
Correct .toc interface value from actual client, not guessed from build number.
Separate addon semver, schema major and detector catalog version.
Release ZIP contains one addon folder; exclude probes, tests, secrets and debug dumps.
