/**
 * Rating generation replay (docs/09,13).
 *
 * Derives rating events from adjudicated match state, replays them with the
 * exact Community Elo engine, and commits a complete generation atomically.
 * Never publishes partial or stale-revision state.
 */

import {
  replay, ladderKeyOf, type RatingEvent, type Score,
} from "@acl/rating";
import { INITIAL } from "@acl/rating";
import type { MatchContract, MatchReport } from "@acl/contracts";
import type { Store } from "./store.js";

const VERIFIED_TIERS = new Set(["witnessed", "provider_verified"]);

/** Derive the projection input event for one adjudicated match. */
export async function deriveEvent(store: Store, matchId: string): Promise<RatingEvent | null> {
  const match = await store.getMatch(matchId);
  const contractRow = await store.getContract(matchId);
  if (!match || !contractRow) return null;
  const contract = contractRow.canonical as MatchContract;
  const participants = await store.participantsOf(matchId);
  const games = await store.matchGames(matchId);
  const reports = await store.reportsForMatch(matchId);

  const [pa, pb] = participants;
  if (!pa || !pb || participants.length !== 2) return null;

  const charA = await store.getCharacter(pa.characterId);
  const charB = await store.getCharacter(pb.characterId);
  if (!charA || !charB) return null;

  // canonical participant order is character UUID lexical order
  const aIsFirst = pa.characterId < pb.characterId;
  const first = aIsFirst ? pa : pb;
  const second = aIsFirst ? pb : pa;
  const charFirst = aIsFirst ? charA : charB;
  const charSecond = aIsFirst ? charB : charA;

  // agreed series winner from corroborated games (independent reports agree)
  const winsNeeded = Math.ceil(contract.bestOf / 2);
  const tally = new Map<string, number>();
  for (const g of games) {
    if (g.winnerCharacterId) tally.set(g.winnerCharacterId, (tally.get(g.winnerCharacterId) ?? 0) + 1);
  }
  let winnerId: string | null = null;
  for (const [cid, n] of tally) {
    if (n >= winsNeeded) winnerId = cid;
  }
  // fall back to a single agreeing report's claims when games aren't materialized yet
  if (!winnerId && reports.length > 0) {
    const tallyR = new Map<string, number>();
    for (const g of (reports[0]!.body as MatchReport).games) {
      if (g.claimedWinnerCharacterId) {
        tallyR.set(g.claimedWinnerCharacterId, (tallyR.get(g.claimedWinnerCharacterId) ?? 0) + 1);
      }
    }
    for (const [cid, n] of tallyR) if (n >= winsNeeded) winnerId = cid;
  }

  const score: Score = winnerId === null ? 0.5
    : winnerId === first.characterId ? 1 : 0;

  const eligible =
    match.lifecycle === "finished"
    && match.evidence === "corroborated"
    && (match.rating === "pending" || match.rating === "applied")
    && contract.ratedIntent
    && contract.ladder !== null
    && first.accountIdAtMatch !== second.accountIdAtMatch
    && VERIFIED_TIERS.has(charFirst.verificationTier)
    && VERIFIED_TIERS.has(charSecond.verificationTier);

  if (match.firstSeenAt === null || match.receiptSeq === null) return null;

  return {
    id: match.id,
    seq: match.receiptSeq,
    firstSeen: match.firstSeenAt,
    season: contract.seasonId,
    pool: contract.poolId,
    bracket: `${contract.levelMin}-${contract.levelMax}`,
    ladder: contract.ladder ?? "open",
    a: first.characterId,
    b: second.characterId,
    accountA: first.accountIdAtMatch,
    accountB: second.accountIdAtMatch,
    classA: String(charFirst.classId),
    classB: String(charSecond.classId),
    score,
    eligible,
  };
}

export interface MemberRow {
  ladder_key: string;
  character_id: string;
  rating_milli: number;
  positive_series: number;
  distinct_opponents: number;
  last_activity: string;
}

/** Build and commit a complete rating generation for a season. */
export async function buildGeneration(
  store: Store,
  seasonId: string,
  generationId: string,
): Promise<{ status: string; events: number; generationId: string; inputRevision: number }> {
  const inputRevision = await store.seasonInputRevision(seasonId);
  const matches = await store.matchesForSeason(seasonId);
  const events: RatingEvent[] = [];
  for (const m of matches) {
    const e = await deriveEvent(store, m.id);
    if (e) events.push(e);
  }
  const { ratings, ledger } = replay(events);

  // ledger rows for commit_rating_generation
  const ledgerRows = ledger.flatMap((l, i) => {
    const e = events.find((x) => x.id === l.id)!;
    const lk = ladderKeyOf(e);
    return [
      {
        match_id: l.id, ladder_key: lk, participant: e.a,
        before_milli: l.beforeA, delta_milli: l.delta, after_milli: l.a,
        pair_prior_count: l.priorCount, pair_weight: l.weight, ordinal: i,
      },
      {
        match_id: l.id, ladder_key: lk, participant: e.b,
        before_milli: l.beforeB, delta_milli: -l.delta, after_milli: l.b,
        pair_prior_count: l.priorCount, pair_weight: l.weight, ordinal: i,
      },
    ];
  });

  // ladder members: rating + positive-weight series + distinct opponents
  const memberStats = new Map<string, { series: number; opponents: Set<string>; last: number }>();
  for (const l of ledger) {
    const e = events.find((x) => x.id === l.id)!;
    const lk = ladderKeyOf(e);
    for (const [char, opp] of [[e.a, e.accountB], [e.b, e.accountA]] as const) {
      const key = JSON.stringify([lk, char]);
      const s = memberStats.get(key) ?? { series: 0, opponents: new Set<string>(), last: 0 };
      if (l.weight > 0) {
        s.series++;
        s.opponents.add(opp);
        s.last = Math.max(s.last, e.firstSeen);
      }
      memberStats.set(key, s);
    }
  }
  const members: MemberRow[] = [...ratings.entries()].map(([key, ratingMilli]) => {
    const [lk, characterId] = JSON.parse(key) as [string, string];
    const s = memberStats.get(key);
    return {
      ladder_key: lk,
      character_id: characterId,
      rating_milli: ratingMilli,
      positive_series: s?.series ?? 0,
      distinct_opponents: s?.opponents.size ?? 0,
      last_activity: s ? new Date(s.last).toISOString() : new Date(0).toISOString(),
    };
  });

  const result = await store.commitGeneration({
    generationId, seasonId, inputRevision,
    ledger: ledgerRows, members,
  });
  const status = result === "published" ? "published" : `stale_revision:${result.actual}`;
  if (status === "published") {
    // the published generation consumed this work — mark eligible series
    // applied (idempotent; deriveEvent still accepts them on rebuild)
    for (const e of events) {
      if (e.eligible) await store.setMatchState(e.id, { rating: "applied" });
    }
  }
  return { status, events: events.length, generationId, inputRevision };
}

export { INITIAL };
