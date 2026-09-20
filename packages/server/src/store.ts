/**
 * Store abstraction for trusted backend logic. The production binding is
 * Postgres (supabase/migrations); tests use InMemoryStore. Every function in
 * this package must be runnable against both.
 */

import type { RatingEvent } from "@acl/rating";

export type { RatingEvent };

export interface ContractRow {
  id: string;
  contractHash: string;
  canonical: unknown;
  seasonId: string;
  poolId: string;
  rulesetVersionId: string;
  ratedIntent: boolean;
  ladder: "open" | "mirror" | null;
  bestOf: number;
  levelMin: number;
  levelMax: number;
}

export interface ParticipantRow {
  matchId: string;
  characterId: string;
  accountIdAtMatch: string;
  side: number;
}

export type Lifecycle = "proposed" | "accepted" | "ready" | "armed" | "active" | "finished"
  | "declined" | "cancelled" | "expired" | "interrupted" | "void";
export type Evidence = "awaiting" | "peer_supported" | "corroborated" | "disputed" | "invalid";
export type RatingState = "ineligible" | "pending" | "applied" | "held" | "superseded";

export interface MatchRow {
  id: string;
  lifecycle: Lifecycle;
  evidence: Evidence;
  rating: RatingState;
  firstSeenAt: number | null;
  receiptSeq: number | null;
  finishedAt: number | null;
}

export interface ReportRow {
  id: string;
  matchId: string;
  originCharacterId: string;
  originAccountId: string;
  installationId: string;
  nonce: string;
  bodyDigest: string;
  body: unknown;
  authMethod: "app_session" | "helper" | "peer_signature";
  receivedAt: number;
  receiptSeq: number | null;
}

export interface CharacterRow {
  id: string;
  accountId: string;
  classId: number;
  level: number;
  verificationTier: "claimed" | "witnessed" | "provider_verified";
}

export interface GameRow {
  matchId: string;
  gameIndex: number;
  winnerCharacterId: string | null;
  finishReason: string | null;
}

export interface Store {
  getContract(id: string): Promise<ContractRow | null>;
  getMatch(id: string): Promise<MatchRow | null>;
  insertContractWithMatch(contract: ContractRow, participants: ParticipantRow[]): Promise<void>;
  /** Inserts a report; resolves dedupe/conflict on (account, installation, nonce). */
  insertReport(r: Omit<ReportRow, "id" | "receivedAt" | "receiptSeq">): Promise<"inserted" | "duplicate" | "conflict">;
  reportsForMatch(matchId: string): Promise<ReportRow[]>;
  participantsOf(matchId: string): Promise<ParticipantRow[]>;
  getCharacter(id: string): Promise<CharacterRow | null>;
  /**
   * Self-registration (docs/26): inserts a character owned by `accountId`
   * inside the deployment's identity scope. Always lands at `claimed` tier —
   * only witness check-ins or provider verification raise it. Returns
   * "name_taken" when the lowercased name is already claimed in that scope
   * (one name per community, regardless of account).
   */
  createCharacter(c: {
    accountId: string; name: string; classId: number; factionId: number;
    level: number; product: string; environment: string; region: string; realmId: string;
  }): Promise<CharacterRow | "name_taken">;
  /** Assign immutable first_seen_at + receipt_seq on first valid receipt. */
  assignReceipt(matchId: string, nowMs: number): Promise<number>;
  setMatchState(matchId: string, patch: Partial<Pick<MatchRow, "lifecycle" | "evidence" | "rating" | "finishedAt">>): Promise<void>;
  /** Insert/replace the reconciled game rows for a match. */
  setMatchGames(matchId: string, games: GameRow[]): Promise<void>;
  matchGames(matchId: string): Promise<GameRow[]>;
  /** All matches belonging to a season (via their contract). */
  matchesForSeason(seasonId: string): Promise<MatchRow[]>;
  /** Current input revision for a season (bumps on any rating-input change). */
  seasonInputRevision(seasonId: string): Promise<number>;
  bumpInputRevision(seasonId: string): Promise<number>;
  /** Persist a completed generation + swap the head atomically. */
  commitGeneration(gen: {
    generationId: string;
    seasonId: string;
    inputRevision: number;
    ledger: unknown[];
    members: unknown[];
  }): Promise<"published" | { status: "stale_revision"; actual: number }>;
}
