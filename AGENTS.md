# Coding agent instructions — v2

## Mission
Build a delightful community tool that one owner and a few volunteer referees can operate. Implement independent components while client tests run. Do not silently invent game capabilities or rating mathematics.

## Authority
This package supersedes v1 and the old master plan.
The first runnable delivery is docs/30_TWO_DEVELOPER_BETA_LAB.md. Assume retail-style addon APIs, then measure exact Forever runtime. Normal ranked play must not depend on routine manual exports.

Canonical domains: 09 rating, 26 identity, 06 protocol, 27 uploader, 08 rules, 28 detection, 04 client capabilities.
User instructions take precedence. Resolve conflicts explicitly.

## Invariants
- Addon, browser, and helper clients are editable. A signature authenticates an enrolled key, not honest gameplay.
- No unsupported one-party claim changes rank. Independent participant attestations or an evidence-backed scoped referee decision are required.
- No Blizzard tokens, website passwords, or service keys in addon files.
- No secret-data reconstruction, gameplay automation, memory reads, input injection, or tactical overlays.
- Immutable evidence/decisions, idempotent effects, deterministic rating replay.
- Zero-weight rematches cannot improve competitive eligibility.
- Custom rules cannot silently affect Standard rating.
- Show freshness on offline/imported data.
- Never silently delete unsynced evidence.

## Engineering
Strict TypeScript, modular Lua, schema validation, DB constraints/RLS. Use proven crypto libraries. No Redis/microservices/enterprise role hierarchy by default.
Tests should match the changed subsystem; website copy changes do not require a live WoW smoke test.
Keep portable SQL migrations and exported config.

## Delivery
Ship recorder, practice flow, web pages, rules builder, identity, and shadow rating as a working slice. Then public beta ranking and events.
Block only the unsupported capability. Early optional uploader depends on a permitted file bridge, not on an invented live HTTP API.
Do not launch a restricted mode because its datamined function exists.
Every handoff lists changed files, passing tests, remaining human client probes, and the next useful player feature.
