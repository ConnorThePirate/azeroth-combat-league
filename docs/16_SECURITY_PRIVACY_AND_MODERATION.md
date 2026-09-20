# Practical community integrity

Assume clients can be edited and friends can collude. Promise transparent community verification, not anti-cheat.

## Controls that matter
Battle.net connection with stable private provider identity; separate character proof.
Authenticated report origin; content hashes are not signatures.
Schema/size/decompression/rate limits; idempotency; RLS; append-only decisions; exact rating replay.
No tokens in Lua. Scoped helper credential in OS store. File parser never executes Lua.
HTTPS, secure app session handling, OAuth state/redirect validation and server-only secrets.
MFA for owner/staff where available. No public raw evidence buckets.

## Volunteer roles
Member, event organizer, assigned referee, owner/moderator.
Ordinary small unrated hosting open to members. Sanctioned rating events need review.
A volunteer cannot decide their own dispute.
Permanent bans/title removal get second review when another trusted moderator exists; solo-owner emergency suspension is allowed with public reason category and later review. Do not make two staff an impossible prerequisite for running a hobby beta.

## Missing uploads and false disputes
No automatic wins on a one-sided report.
Do not erase ranking because someone files an allegation.
Notify, allow bounded response, adjudicate evidence. Repeated demonstrated abandonment/false allegations can limit ranked access.
Shared IP, household, unusual win rate, or class matchup advantage alone is never proof.

## Privacy
Character public for ranked history; BattleTag/provider IDs/tokens private by default.
No unrelated private chat, exact hostile tracking, device fingerprinting, or IP-derived public information.
World/Pit opt-in; location coarse and expiring.
Deletion revokes identity/device credentials and removes optional private content; pseudonymize minimal competition history needed for audit, clearly disclosed.
90-day verbose evidence retention, extended for disputes. Keep replay-relevant outcome/decision inputs.

## Moderation
Simple queue: claim, compare evidence, decide, give reason, permit appeal, archive.
Actions: uphold, correct, void, game loss/DQ, temporary ranked restriction, ban, bracket repair.
No public accusation feed or automated “cheater” label.
Rate limit unsolicited challenges/horns and allow blocks/quiet mode.

## Release basics
Secrets scan, RLS cross-account tests, malicious upload tests, token revoke, replay/idempotency, backup restore, pause-rating switch and private security contact.
Code signing and policy review for optional helper; never instruct bypassing OS security.
