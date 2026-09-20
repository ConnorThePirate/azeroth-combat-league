# Website experience

Tone: a welcoming player-run fight club. Fast, readable, mobile-friendly; unofficial identity. Avoid a corporate SaaS dashboard.

## Main pages
Home: next fight night, current cap, Find local fights, download, community highlights.
Leaderboards: Open, class-filter Open, Mirror; pool/season/bracket selection; established/new/inactive tabs.
Player: character, rating, placement progress, matchup history, rivals, passport, titles and public matches.
Match: rules, per-game score, origin/coverage evidence badge, clear pending/dispute/zero-weight reason, rating generation.
Rules: browse, clone, customize item/category exceptions, share code, show Standard eligibility.
Tournaments: public directory, private membership, builder, check-in, bracket, referee console.
World/Pit: separate journals/events/scoreboards with evidence and freshness.
Account: Battle.net connection, character claims, devices, session upload, privacy.
Status: build capabilities, known failures, config freshness.

## Rank UX
One understandable number. No RD/volatility/conservative score in v2.
Show “New Challenger: 6/10 series, 3/5 opponents” rather than hiding all progress.
Separate unconnected pools; a combined directory must not declare a single calibrated champion.
Class-filter board shares Open rating; Mirror card explicitly separate.
No fake reset-free rematch bonus.

## Result card
Winner/series, Confirm, Report problem, Rematch.
Show only meaningful issues: missing peer evidence, monitored-rule gap, suspected prohibited effect, stale config.
Addon Copy results opens a selectable batch; website Import results previews then submits it. Player never retypes captured match data. Companion users can save a whole session through one safe player-initiated reload.

## Sync experience
Follow 27_AUTOMATIC_RECORDING_AND_UPLOADER.md. Live sync status is easy to find on the player/account page. Import results is in Advanced / Recovery; Copy addon update is optional for refreshing the offline display. Preserve pasted input through sign-in, handle batches and duplicates, and separate report received from rating settled. Current website rating and last-known addon rating have explicit timestamps.
For automatic delivery, offer companion setup or a proven participant/relay carrier. Continue without a carrier means local practice, not a promise of automatic ranked uploads. No forced setup before practice, per-duel website visits, fake live connection badge in the addon, or reload-equals-upload wording. After website import, copying an update back is optional; the match can settle without it.

## Rules builder
Preset first, Advanced expandable. Item search by localized name plus canonical ID, category toggles, phase tabs, exception badges, estimated coverage.
Custom changes remove Standard-rated badge immediately. Share immutable version/code.
Unknown detector coverage is visible before acceptance.

## Accessibility and freshness
Keyboard, labels, contrast, reduced motion. Loading, empty, stale, partial, retry, authorization and quota states.
Unknown is not zero.
Data source/last-sync time on ranking, event and addon import pages.
Static SPA is fine for beta; dynamic social cards/crawlable public HTML require explicit prerender/worker endpoint later, not an implied SPA capability.

## Privacy/community
Quiet notifications, blocks, no unsolicited global chat. Optional rivalry sharing and screenshots/cards.
No public trust score or accusation feed. Moderation evidence private.
Measure actual usability and returning play, not growth funnels.
