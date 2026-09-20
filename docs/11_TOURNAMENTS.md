# Community tournaments

## Make hosting easy
Templates: Eight-player Fight Night, Class Mirror Cup, Rookie Cup, Guild Invitational, Gurubashi Crown.
Public, unlisted and private events. Small unrated public events are available without organizer reputation grinding.
Trusted/sanctioned event badge is separate from ordinary hosting permission.

## Fields
Name/description, region/realm, visibility/invite membership, level/class bracket, format, entrants, ruleset version, venue/rally leader, dates/timezone, check-in, best-of per round, seeding, staff, stream link, dispute window.
Custom allowed items use the same builder as duels.
Changes after registration notify entrants and require consent for material rule changes.

## Formats
Single elimination first; round robin for small gatherings; double elimination next, Swiss later.
Byes advance bracket but never generate Elo.
Best-of is one rating event.
Bracket nodes have immutable seed identity plus lock_version.
Result advancement uses corroboration/referee decision; one participant cannot advance themselves unilaterally.

## Defaults
8/16 entrants, 15-minute check-in, best-of-1 early rounds, best-of-3 final, Standard preset.
No-show grace 10 minutes; event referee may advance opponent, but this is administrative progression and not an Elo win without a played/evidence-backed match.
Default event unrated. Sanctioned Standard can affect declared ladder, with usual repeat limits. A zero-weight final still awards the tournament trophy.
Custom formats have event standings, not official rating.

## Operations
draft -> published -> registration -> check_in -> seeded -> active -> review -> complete/cancelled.
Organizer handles bracket; referee handles assigned match; owner handles sanctions. No ruling own disputed match.
One player per linked account per event unless an explicitly casual alt format.
Audit bracket repair and reseeding; never silently rewrite finished rounds.
Do not reverse downstream bracket games automatically after a late appeal. Freeze affected branch, retain played games and let organizer publish a repair decision.

## Addon/website
Website builds/administers; addon shows next opponent/rules/ring, ready/report and dated bracket snapshot.
Cross-faction code/referee flow if local messaging fails. No live update promise without transport proof.
Spectator bracket and caster fight cards contain only public data and permitted delayed stats.

## Teams
Supervised 2s/3s exhibition may run with roster/referee despite no native arena. Unrated and interference-prone.
Rated native team modes need exact roster/start/outcome and pre-combat consent. Unequal ranks in unranked queue are expected.
When both sides have the addon, offer the common preset during the actual pre-match preparation window if communication is permitted. A per-mode standing opt-in can preauthorize an exact Standard version and rating conditions, but any changed terms require fresh acceptance. If discovery/consent cannot complete before combat, record practice only. Do not alter the game's queue or decline/cancel its match automatically.
5s is schema-ready but disabled until population and evidence justify it.
