/**
 * Community Elo v1 — algorithm ID `community-elo-1` (docs/09).
 *
 * Pure deterministic logic only. Inputs are server-validated and adjudicated
 * match events; this module never reads client clocks or performs I/O.
 *
 * Exact rules:
 * - ratings are integer milli-ratings, initial 1500000 (1500.000)
 * - E = 1 / (1 + 10^((RB - RA) / 400)), exponent input clamped to [-16, 16]
 * - delta = roundTiesAwayFromZero(32000 * w * (S - E)); K = 32 for everyone
 * - pair repeat weight w: prior corroborated series in rolling 7 days
 *   0 -> 1, 1 -> 0.5, 2 -> 0.25, >=3 -> 0
 * - canonical participant order is character UUID lexical order
 * - projection order is (first_seen_at, receipt_seq), never client clocks
 */

export const ALGORITHM_ID = "community-elo-1";
export const INITIAL = 1500000;
export const WEEK = 7 * 24 * 60 * 60 * 1000;
export const K_MILLI = 32000;
export const PAIR_WEIGHTS = [1, 0.5, 0.25] as const;

/** Round half away from zero, per spec. */
export function roundAway(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

export function weightFor(priorCount: number): number {
  if (!Number.isSafeInteger(priorCount) || priorCount < 0) {
    throw new Error("Invalid prior count");
  }
  return PAIR_WEIGHTS[priorCount] ?? 0;
}

export type Score = 0 | 0.5 | 1;
export type PairWeight = 0 | 0.25 | 0.5 | 1;

export interface UpdateResult {
  a: number;
  b: number;
  delta: number;
}

/**
 * One series update. `a`/`b` are pre-match milli-ratings in canonical A/B
 * order; `score` is A's series score (a best-of is a single event).
 */
export function update(a: number, b: number, score: Score, weight: PairWeight): UpdateResult {
  if (
    !Number.isSafeInteger(a) || !Number.isSafeInteger(b)
    || ![0, 0.5, 1].includes(score)
    || ![0, 0.25, 0.5, 1].includes(weight)
  ) {
    throw new Error("Invalid rating input");
  }
  if (weight === 0) return { a, b, delta: 0 };
  const exponent = Math.max(-16, Math.min(16, (b - a) / 400000));
  const expected = 1 / (1 + 10 ** exponent);
  const delta = roundAway(K_MILLI * weight * (score - expected));
  if (!Number.isSafeInteger(a + delta) || !Number.isSafeInteger(b - delta)) {
    throw new Error("Rating overflow");
  }
  return { a: a + delta, b: b - delta, delta };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type LadderId = "open" | "mirror";

/**
 * One adjudicated, rating-eligible-or-not match event. The projection uses
 * `firstSeen`/`seq` for ordering — server receipt data, never client times.
 */
export interface RatingEvent {
  /** Match/event UUID. */
  id: string;
  /** Server receipt sequence (unique, monotonically ordered). */
  seq: number;
  /** Server first-seen timestamp, integer ms. */
  firstSeen: number;
  season: string;
  pool: string;
  bracket: string;
  ladder: LadderId;
  /** Participant character IDs in canonical order: a < b lexically. */
  a: string;
  b: string;
  /** Linked account IDs — drive the pair repeat counter. */
  accountA: string;
  accountB: string;
  classA: string;
  classB: string;
  /** A's series score. */
  score: Score;
  /** Rating-eligible flag resolved upstream (lifecycle/evidence/identity). */
  eligible: boolean;
}

export interface LedgerEntry {
  id: string;
  seq: number;
  priorCount: number;
  weight: number;
  beforeA: number;
  beforeB: number;
  a: number;
  b: number;
  delta: number;
}

export interface ReplayResult {
  /** Map ladderKey+character -> milli-rating. */
  ratings: Map<string, number>;
  ledger: LedgerEntry[];
}

export function ladderKeyOf(e: Pick<RatingEvent, "season" | "pool" | "bracket" | "ladder" | "classA">): string {
  return JSON.stringify([e.season, e.pool, e.bracket, e.ladder, e.ladder === "mirror" ? e.classA : null]);
}

/** Canonical unordered pair key: season + sorted linked accounts. */
export function pairKeyOf(e: Pick<RatingEvent, "season" | "accountA" | "accountB">): string {
  return JSON.stringify([e.season, ...[e.accountA, e.accountB].sort()]);
}

export function validateEvent(e: RatingEvent): void {
  if (!Number.isSafeInteger(e.seq) || e.seq < 0 || !Number.isSafeInteger(e.firstSeen)) {
    throw new Error("Invalid event");
  }
  if (e.ladder !== "open" && e.ladder !== "mirror") throw new Error("Invalid event");
  for (const s of [e.id, e.season, e.pool, e.bracket, e.a, e.b, e.accountA, e.accountB]) {
    if (typeof s !== "string" || s.length === 0) throw new Error("Invalid identity");
  }
  if (!(e.a < e.b)) throw new Error("Participants must use canonical character order");
  if (e.ladder === "mirror" && e.classA !== e.classB) throw new Error("Mirror mismatch");
}

/**
 * Replay a season's events into ratings + ledger. Order-independent: events
 * are sorted by (firstSeen, seq) exactly like the production projection.
 */
export function replay(events: RatingEvent[]): ReplayResult {
  const seenIds = new Set<string>();
  const seenSeq = new Set<number>();
  for (const e of events) {
    if (seenIds.has(e.id) || seenSeq.has(e.seq)) throw new Error("Duplicate event/receipt");
    seenIds.add(e.id);
    seenSeq.add(e.seq);
    validateEvent(e);
  }
  const sorted = [...events].sort((x, y) => x.firstSeen - y.firstSeen || x.seq - y.seq);
  const ratings = new Map<string, number>();
  const pairs = new Map<string, number[]>();
  const ledger: LedgerEntry[] = [];
  for (const e of sorted) {
    if (!e.eligible || e.accountA === e.accountB) continue;
    const pair = pairKeyOf(e);
    const history = (pairs.get(pair) ?? []).filter((t) => t > e.firstSeen - WEEK);
    const weight = weightFor(history.length);
    const lk = ladderKeyOf(e);
    const keyA = JSON.stringify([lk, e.a]);
    const keyB = JSON.stringify([lk, e.b]);
    const beforeA = ratings.get(keyA) ?? INITIAL;
    const beforeB = ratings.get(keyB) ?? INITIAL;
    const result = update(beforeA, beforeB, e.score, weight as PairWeight);
    ratings.set(keyA, result.a);
    ratings.set(keyB, result.b);
    ledger.push({
      id: e.id, seq: e.seq, priorCount: history.length, weight,
      beforeA, beforeB, a: result.a, b: result.b, delta: result.delta,
    });
    history.push(e.firstSeen);
    pairs.set(pair, history);
  }
  return { ratings, ledger };
}

// ---------------------------------------------------------------------------
// Eligibility helpers (docs/09) — display/projection-side, not rating math.
// ---------------------------------------------------------------------------

export interface PlacementProgress {
  series: number;
  opponents: number;
}

/** Open: 10 positive-weight series against >=5 distinct linked accounts. */
export const OPEN_ESTABLISHED = { series: 10, opponents: 5 } as const;
/** Mirror: 6 positive-weight series against >=3 same-class linked accounts. */
export const MIRROR_ESTABLISHED = { series: 6, opponents: 3 } as const;
/** Seasonal champion floor when population supports it. */
export const CHAMPION = { series: 10, opponents: 5 } as const;
/** Active window: >=1 positive-weight series in preceding 14 days. */
export const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Percentile titles require this many established active accounts. */
export const TITLE_MIN_POPULATION = 20;

export function isEstablished(ladder: LadderId, p: PlacementProgress): boolean {
  const t = ladder === "open" ? OPEN_ESTABLISHED : MIRROR_ESTABLISHED;
  return p.series >= t.series && p.opponents >= t.opponents;
}

export function displayRating(ratingMilli: number): number {
  // nearest integer, ties away from zero
  return roundAway(ratingMilli / 1000);
}
