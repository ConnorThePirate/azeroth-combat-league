/**
 * Wire types for protocol v2 (docs/06). All timestamps are integer
 * milliseconds; all identities are UUIDs; display names are display-only.
 */

export const SCHEMAS = {
  matchContract: "wf.match-contract.v2",
  matchReport: "wf.match-report.v2",
  syncEnvelope: "wf.sync-envelope.v2",
  addonUpdate: "wf.addon-update.v1",
} as const;

export type Ladder = "open" | "mirror";
export type Side = 1 | 2;
export type BestOf = 1 | 3 | 5;

export interface ContractParticipant {
  characterId: string;
  side: Side;
}

export interface ContractVenue {
  kind: "anywhere" | "map" | "area";
  mapId: number | null;
  areaId: number | null;
}

export interface MatchContract {
  schema: typeof SCHEMAS.matchContract;
  sessionId: string;
  seasonId: string;
  poolId: string;
  ladder: Ladder | null;
  ratedIntent: boolean;
  bestOf: BestOf;
  rulesetVersionId: string;
  participants: [ContractParticipant, ContractParticipant];
  levelMin: number;
  levelMax: number;
  venue: ContractVenue;
  tournamentMatchId: string | null;
  createdAtMs: number;
  acceptByMs: number;
  configVersion: string;
}

export type FinishReason =
  | "surrender"
  | "bounds"
  | "death"
  | "timeout"
  | "disconnect"
  | "interrupted"
  | "unknown";

export interface ReportedGame {
  index: number;
  observedStartMs: number | null;
  observedEndMs: number | null;
  claimedWinnerCharacterId: string | null;
  finishReason: FinishReason;
  /** Normalized evidence facts (bounded; see docs/28). */
  facts: Record<string, unknown>[];
  interferenceCandidates: Record<string, unknown>[];
  violationCandidates: Record<string, unknown>[];
}

export interface CoverageEntry {
  ruleId: string;
  status: "observable" | "corroborated" | "attested" | "unavailable";
  gameIndex: number | null;
  intervalStartMs: number | null;
  intervalEndMs: number | null;
}

export interface Attestation {
  /** SHA-256 hex of canonical contract bytes the signer accepted. */
  contractHash: string;
  /** SHA-256 hex of the attested outcome statement. */
  outcomeDigest: string;
  signerCharacterId: string;
}

export interface MatchReport {
  schema: typeof SCHEMAS.matchReport;
  sessionId: string;
  contractHash: string;
  originCharacterId: string;
  installationId: string;
  nonce: string;
  build: string;
  addonVersion: string;
  detectorCatalogVersion: string;
  proposedAtMs: number | null;
  acceptedAtMs: number | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  games: ReportedGame[];
  coverage: CoverageEntry[];
  attestations: Attestation[];
  /** Digests of peer reports this client observed or carried. */
  peerDigests: string[];
}

export interface SyncEnvelope {
  schema: typeof SCHEMAS.syncEnvelope;
  installationId: string;
  build: string;
  addonVersion: string;
  exportedAtMs: number;
  reports: MatchReport[];
}

export type ReceiptStatus =
  | "accepted"
  | "duplicate"
  | "rejected"
  | "awaiting_peer"
  | "corroborated"
  | "disputed"
  | "rating_pending";

export interface UpdateReceipt {
  installationId: string;
  nonce: string;
  bodyDigest: string;
  receiptId: string;
  status: ReceiptStatus;
}

export interface LadderSnapshot {
  seasonId: string;
  poolId: string;
  ladder: Ladder;
  ratingMilli: number;
  placementSeries: number;
  placementOpponents: number;
  generationId: string;
}

export interface UpdateCharacter {
  characterId: string;
  ladders: LadderSnapshot[];
}

/**
 * A published, immutable ruleset version delivered to the addon (docs/08).
 * Data-only: rules are declarative clauses, never executable content.
 * `standard: true` marks the single community-approved rated ruleset;
 * everything else is casual by definition.
 */
export interface PublishedRuleset {
  rulesetId: string;
  versionId: string;
  version: number;
  name: string;
  description: string;
  standard: boolean;
  rules: RuleClause[];
}

export type RuleAction = "allow" | "deny" | "limit";
export type RulePhase = "preparation" | "ready" | "active" | "between_games" | "series_end";
export type RuleSanction = "game_loss" | "void_game" | "none";

export interface RuleClause {
  ruleId: string;
  category: string;
  action: RuleAction;
  phase: RulePhase;
  itemIds?: number[];
  effectIds?: number[];
  countLimit?: number;
  detectorId?: string;
  sanction: RuleSanction;
}

export interface AddonUpdate {
  schema: typeof SCHEMAS.addonUpdate;
  accountId: string;
  snapshotSequence: number;
  issuedAtMs: number;
  characters: UpdateCharacter[];
  receipts: UpdateReceipt[];
  configVersion: string;
  /** Published ruleset versions the addon should offer (optional, additive). */
  rulesets?: PublishedRuleset[];
}
