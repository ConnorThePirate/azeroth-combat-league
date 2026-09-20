/** Data layer types — mirror the domain model (docs 06/07/09/12). */

export type WowClass =
  | "warrior" | "paladin" | "hunter" | "rogue" | "priest"
  | "shaman" | "mage" | "warlock" | "druid";

/**
 * Character identity strength (docs/26) — an account-level fact, never a
 * per-duel concept. "witnessed" means a volunteer verified the character
 * at an event check-in (organizer-designated staff only); regular duels
 * are corroborated by the two clients, never witnessed.
 */
export type VerificationTier = "claimed" | "witnessed" | "provider_verified";

export type Ladder = "open" | "mirror";

/** doc 12 status language — each surface only shows what it can know */
export type RecordStatus =
  | "recorded_locally"   // addon knows it exists
  | "saved_for_upload"   // flushed to SavedVariables
  | "received"           // website got the report
  | "awaiting_opponent"  // one side in, peer evidence pending
  | "under_review"       // disputed / referee
  | "rated";             // applied to a rating generation

export interface PlacementProgress {
  seriesDone: number;
  seriesNeeded: number;
  opponentsDone: number;
  opponentsNeeded: number;
}

export interface Player {
  id: string;
  name: string;
  wowClass: WowClass;
  realm: string;
  tier: VerificationTier;
  open: { rating: number | null; placement: PlacementProgress | null; wins: number; losses: number };
  mirror: { rating: number | null; placement: PlacementProgress | null; wins: number; losses: number };
  titles: string[];
  lastActiveAtMs: number;
}

export type EvidenceBadge = "corroborated" | "peer_supported" | "referee" | "disputed";

export interface MatchGame {
  index: number;
  winnerId: string | null;
  reason: string;
  voided: boolean;
}

export interface MatchRecord {
  id: string;
  a: { playerId: string; name: string; wowClass: WowClass };
  b: { playerId: string; name: string; wowClass: WowClass };
  winnerId: string | null;
  scoreA: number;
  scoreB: number;
  bestOf: number;
  ladder: Ladder | null;      // null = unrated/custom
  rulesetName: string;
  standard: boolean;          // exact approved Standard version?
  status: RecordStatus;
  evidence: EvidenceBadge;
  reportsReceived: number;    // independent participant reports the server holds
  games: MatchGame[];
  playedAtMs: number;
  receivedAtMs: number | null;
  ratedAtMs: number | null;
  ratingDelta: number | null; // milli-rating delta for winner display, post-replay
  weightPercent: number;      // pair-repeat weight — 0 means zero-weight rematch
  note?: string;              // pending/dispute reason in plain language
}

export interface Rival {
  playerId: string;
  name: string;
  wowClass: WowClass;
  wins: number;      // decided, non-disputed series won
  losses: number;
  meetings: number;  // all shared matches incl. pending/disputed
  lastPlayedMs: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  wowClass: WowClass;
  rating: number;
  wins: number;
  losses: number;
  placement: PlacementProgress | null;
  tier: VerificationTier;
}

export type RuleCategory =
  | "consumable" | "trinket" | "engineering" | "class_created"
  | "pet" | "food_drink" | "world_buff" | "equipment_swap";

export type RulePhase = "preparation" | "ready" | "active" | "between_games";

export interface RulesetRule {
  id: string;
  category: RuleCategory;
  action: "deny" | "allow" | "limit";
  phase: RulePhase;
  count?: number;
  itemExceptions: { id: number; name: string }[];
}

export interface Ruleset {
  id: string;
  name: string;
  preset: "standard" | "pure_duel" | "fieldcraft" | "anything_goes" | "custom";
  standardEligible: boolean;   // exact approved immutable Standard version?
  immutable: boolean;
  rules: RulesetRule[];
  coverageNote: string;        // honest detector coverage summary
  /** Server-published versions only: version number + when published. */
  version?: number;
  publishedAtMs?: number | undefined;
}

export interface ClubEvent {
  id: string;
  name: string;
  kind: "fight_night" | "mirror_cup" | "rookie_night" | "gurubashi";
  whenMs: number;
  venue: string;
  status: "upcoming" | "live" | "done";
  description: string;
  signups: number;
  cap: number;
  registered?: boolean;   // present when the caller has a session
  managedByMe?: boolean;  // caller is the event's organizer
  /** Organizer-designated staff — referees decide disputes and run
   *  identity check-ins ("witnessing" exists only in this scope).
   *  `name` is their character name; `playerId`/`wowClass` link and color
   *  it when the staff member has a character on record. */
  staff?: {
    name: string; role: "organizer" | "referee";
    playerId?: string; wowClass?: WowClass;
  }[];
}

/** World PvP — opt-in war/pit journal boards (docs/10). `scoringLive`
 *  is honest: points are pilot numbers until client probes green-light
 *  the detection the scores depend on. */
export interface WorldEntry {
  rank: number; playerId: string; name: string; wowClass: WowClass;
  points: number; reports: number;
}
export interface WorldBoard {
  war: WorldEntry[]; pit: WorldEntry[]; scoringLive: boolean;
}

export interface CapabilityStatus {
  id: string;
  label: string;
  status: "working" | "partial" | "unknown" | "down";
  note: string;
}

export interface SiteStatus {
  configVersion: string;
  generatedAtMs: number;
  capabilities: CapabilityStatus[];
  ratingGeneration: { id: string; computedAtMs: number; seriesCounted: number } | null;
}
