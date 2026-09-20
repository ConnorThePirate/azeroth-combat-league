# Security policy

Azeroth Combat League handles community match evidence, device pairing
tokens, and (eventually) linked Battle.net identities. We take reports
seriously and fix confirmed issues quickly.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting on this repository
(*Security → Report a vulnerability*). If that's unavailable, contact the
maintainer through the profile listed on the repository.

Include: what you found, how to reproduce it, and what impact you believe it
has. You'll get an acknowledgement within a few days; this is a volunteer
project, so please allow reasonable time for a fix before disclosure.

## Scope

In scope:

- The API (`packages/server`): auth bypass, rating manipulation, ingest
  forgery, rate-limit bypass, injection, information disclosure.
- The website (`apps/web`): XSS, CSRF, sensitive data exposure.
- The companion (`apps/uploader`): token handling, path traversal in
  SavedVariables/Inbound handling, unsafe process launching.
- Database policies (`supabase`): RLS gaps, privilege escalation via functions.

Out of scope:

- The WoW client itself, Blizzard services, or third-party hosting providers.
- Gameplay exploits not involving this software.
- Denial of service against free-tier hosting quotas.

## Design commitments

- The addon **never** holds tokens, passwords, or service keys. Authentication
  lives in the companion (device token) and the browser (session).
- A signature proves an enrolled key, not honest gameplay: **no one-party
  claim changes rank**. Results require two independent client reports that
  agree, or a scoped referee decision backed by evidence.
- Evidence and decisions are immutable and append-only; ratings are
  re-derived from them deterministically, so a bad decision is corrected by a
  new generation, never by editing history.
- Device tokens are stored hashed; pairing codes are short-lived, single-use,
  and rate-limited.
- Development-only authentication (`ACL_DEV_LOGIN`) is disabled unless
  explicitly enabled and is never enabled in production configurations.
