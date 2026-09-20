# Community Elo v1 — exact specification

Algorithm ID: community-elo-1. Replaces the incomplete Glicko/escrow proposal. Priorities: understandable changes, symmetric repeat weighting, simple replay, and a volunteer-friendly system. No RD, volatility, conservative-score sort, or gain-only escrow.

## Rating populations
Key: season + competition pool + level bracket + ladder + character.
Pool is a configured connected region/realm/faction population. At same-faction-only launch, maintain faction pools; a combined directory is not a calibrated cross-faction ranking.
Open: Standard any-class.
Open-by-Class: filtered Open, no extra update.
Mirror: independent same-class ladder. Contract selects Open or Mirror; never both.
Tournaments affect these ratings only if sanctioned and use identical eligibility/pair rules.
No class, gear, venue, win-margin, or best-of-length modifier.
Future cross-faction pool starts at a season boundary after connectivity is proven.

## Numerical representation
Initial rating 1500.000, stored as integer milli-rating 1500000.
No floor/ceiling or hidden rating. Display nearest integer, ties away from zero.
Rank established active players by internal rating descending. Equal values share displayed rank; UUID provides stable visual order only.
Canonical A/B order is character UUID lexical order, not winner or uploader.

## Exact update
RA/RB are ordinary rating points.
Expected A: E = 1 / (1 + 10^((RB - RA) / 400)).
S = 1 A win, 0 A loss, 0.5 permitted corroborated draw.
K = 32 for all players, placements included.
w = 1, 0.5, 0.25, or 0 from pair policy.
deltaMilli = roundTiesAwayFromZero(32000 * w * (S - E)).
newA = oldA + deltaMilli; newB = oldB - deltaMilli.
Calculate once from both pre-match ratings. Zero weight returns unchanged immediately.
Clamp exponent input to [-16,16] for numeric stability at extreme values.
Pin runtime/algorithm; all implementations must pass cross-runtime fixtures. If floating rounding differs, adopt a reviewed deterministic implementation, not arbitrary tolerance in stored ledger.
Reference implementation and tests: reference/rating.mjs and reference/rating.test.mjs.

## Repeat policy
Counter key: season + canonical unordered linked-account pair, across all characters and Open/Mirror.
At server_first_seen_at t, count earlier eligible rated-format, corroborated series in (t - 7 days, t]. Equal-time records use lower server receipt sequence only.
Include zero-weight rated-format rematches; exclude custom practice, invalid/void, wrong-bracket and same-account matches.
Prior count 0 => 100%; 1 => 50%; 2 => 25%; >=3 => 0%.
Use event rows with exact timestamps, not daily aggregates.
Pair weight affects both gain and loss symmetrically.
The rule constrains known linked alts, not undisclosed other Battle.net accounts.
Server first receipt is chosen instead of editable client timestamps. Delayed uploads can still affect timing; 72-hour age validation bounds but cannot eliminate this weakness.
In-game estimate shows freshness; final weight is computed on server.
Unlimited unranked practice/rematches stay available.

## Eligibility and titles
Open established: 10 positive-weight series against >=5 distinct linked accounts.
Mirror established: 6 positive-weight series against >=3 same-class linked accounts.
Placement ratings update immediately but appear under New Challengers.
Mirror seasonal champion: >=10 positive-weight series and >=5 distinct opponents. If population cannot support this, award event trophies, not a false certainty badge.
Active: >=1 positive-weight series in preceding 14 days, using validated finish time. No rating decay.
An unresolved allegation does not erase a profile's rank; credible review holds concern a specific result.
One title-eligible character per account per class per board; best eligible character selected. Alt entries remain browsable.
Percentile titles require >=20 established active accounts in the pool. Top 10%/1% count is ceil(population*fraction); tied boundary ratings share recognition.
Passport, mentoring, attendance and sportsmanship never affect rating.
No gain-only escrow or special rating boost for newcomers.

## Ordering and replay
Server assigns immutable first_seen_at and unique monotonically ordered receipt_seq on first valid report.
Projection order is first_seen_at then receipt_seq. Never trust client clock for order; never use reconciliation completion order.
When an older pending match becomes eligible, or adjudication changes, recompute affected season in canonical order from 1500, including repeat weights.
Build a new generation with checkpointed bounded jobs; atomically switch active generation pointer only when complete and input revision still matches.
Keep previous generations and immutable decisions. A simple subtraction of an old delta is not sufficient.
Persist algorithm/policy version, input digest, generation, ordinal, prior pair count, weight, before/after ratings, reason.
Concurrent new evidence increments input revision; retry/schedule next generation instead of publishing stale mixed state.
Small beta can replay the whole season. Optimize only when measurements require.
First reports close 72 hours after season end; remaining peer evidence closes 72 hours later. Ordinary appeals settle seven days after final evidence close. Fraud corrections remain possible with audit.
Match pages disclose provisional updates caused by late evidence.

## Golden examples
Independent initial states unless specified:
- 1500/1500, A win, weight 1 => 1516/1484.
- Same start, weight .5 => 1508/1492.
- Same start, weight .25 => 1504/1496.
- Same start, weight 0 or equal-rating draw => unchanged.
- 1700/1500, favorite win => 1707.688/1492.312.
- 1700/1500, underdog win => 1675.688/1524.312.
- Three consecutive A wins from 1500 each, weights 1/.5/.25 => 1526.732/1473.268; fourth rematch zero.
Best-of-3/5 is one event with S determined by series outcome, never per-game rating.

## Anti-abuse
Review closed collusion clusters, high pair concentration, repeated suspicious forfeits, selective uploads, contradictory reports, relinking, and sudden title-cutoff feeding.
Shared household/network is not guilt. Never publish suspicion scores.
Identity unlink/rename cannot reset history.
Direct challenges allow favorable matchup selection: show opponent/class diversity and run varied-opponent nights. Do not secretly rebalance classes.
Before tuning, simulate honest sparse communities, smurfs, two/three/ten-account rings, grinders, late uploads and corrected results. Pair limits reduce farming, do not solve all collusion.

## Future teams
Fixed-roster team entity rated per size (2/3/5), separate from individual rank. Same pairwise formula can be reused after native roster/outcome evidence is demonstrated.
Roster changes and overlapping-account team cycling need explicit eligibility limits before activation.
Existing unranked queue may pair very different ranks; Elo handles expectation, but consent must exist before combat. No queue automation.
