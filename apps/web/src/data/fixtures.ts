/**
 * fixtures.ts — fixture-backed data layer (docs/12).
 *
 * The beta site renders from fixtures so every page, freshness state, and
 * empty state is reviewable before the Supabase backend ships. Swap these
 * functions for API calls behind the same signatures — components never
 * fetch directly.
 */
import type {
  Player, MatchRecord, LeaderboardEntry, Ruleset, ClubEvent, SiteStatus,
  Ladder, WowClass, WorldBoard,
} from "./types";

const H = 3_600_000;
const D = 24 * H;
const now = Date.parse("2026-09-21T20:00:00Z");

const P = (
  id: string, name: string, wowClass: WowClass, rating: number | null,
  wins: number, losses: number, tier: Player["tier"] = "provider_verified",
  placement: Player["open"]["placement"] = null,
): Player => ({
  id, name, wowClass, realm: "Forever", tier,
  open: { rating, wins, losses, placement },
  mirror: { rating: null, wins: 0, losses: 0, placement: null },
  titles: [], lastActiveAtMs: now - 2 * D,
});

export const PLAYERS: Player[] = [
  { ...P("p1", "Mangler", "warrior", 1684, 41, 17), titles: ["Season 1 Contender"] },
  P("p2", "Sneakthief", "rogue", 1622, 33, 19),
  P("p3", "Frostbolt", "mage", 1591, 29, 21),
  { ...P("p4", "Holydin", "paladin", 1560, 24, 22), titles: ["Mirror Cup Finalist"] },
  P("p5", "Shadowmend", "priest", 1521, 19, 18),
  P("p6", "Moonfire", "druid", 1498, 15, 14),
  // Lilbow verified identity at Friday Fight Night check-in (event-scoped
  // witness path — see supabase 0011), still placing on the board.
  { ...P("p7", "Lilbow", "hunter", null, 6, 4, "witnessed",
    { seriesDone: 6, seriesNeeded: 10, opponentsDone: 3, opponentsNeeded: 5 }), titles: [] },
  P("p8", "Totemcall", "shaman", 1471, 12, 11),
  { ...P("p9", "Dotz", "warlock", null, 2, 1, "claimed",
    { seriesDone: 2, seriesNeeded: 10, opponentsDone: 2, opponentsNeeded: 5 }), titles: [] },
  P("p10", "Manglepaw", "druid", 1455, 10, 9),
];
PLAYERS[3]!.mirror = { rating: 1578, wins: 8, losses: 3, placement: null };

export function ladder(l: Ladder): LeaderboardEntry[] {
  const rows = PLAYERS
    .filter((p) => p[l].rating !== null || p[l].placement !== null)
    .map((p) => ({
      playerId: p.id, name: p.name, wowClass: p.wowClass,
      rating: p[l].rating ?? 0, wins: p[l].wins, losses: p[l].losses,
      placement: p[l].placement, tier: p.tier,
    }));
  rows.sort((a, b) => b.rating - a.rating);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export const MATCHES: MatchRecord[] = [
  {
    id: "m1", reportsReceived: 2, a: { playerId: "p1", name: "Mangler", wowClass: "warrior" },
    b: { playerId: "p2", name: "Sneakthief", wowClass: "rogue" },
    winnerId: "p1", scoreA: 2, scoreB: 1, bestOf: 3,
    ladder: "open", rulesetName: "Ranked Standard", standard: true,
    status: "rated", evidence: "corroborated",
    games: [
      { index: 0, winnerId: "p1", reason: "death", voided: false },
      { index: 1, winnerId: "p2", reason: "death", voided: false },
      { index: 2, winnerId: "p1", reason: "death", voided: false },
    ],
    playedAtMs: now - 3 * H, receivedAtMs: now - 3 * H + 120_000,
    ratedAtMs: now - 2 * H, ratingDelta: 19_000, weightPercent: 100,
  },
  {
    id: "m2", reportsReceived: 1, a: { playerId: "p3", name: "Frostbolt", wowClass: "mage" },
    b: { playerId: "p4", name: "Holydin", wowClass: "paladin" },
    winnerId: "p4", scoreA: 0, scoreB: 2, bestOf: 3,
    ladder: "open", rulesetName: "Ranked Standard", standard: true,
    status: "awaiting_opponent", evidence: "peer_supported",
    games: [
      { index: 0, winnerId: "p4", reason: "death", voided: false },
      { index: 1, winnerId: "p4", reason: "death", voided: false },
    ],
    playedAtMs: now - 6 * H, receivedAtMs: now - 6 * H + 90_000,
    ratedAtMs: null, ratingDelta: null, weightPercent: 50,
    note: "One report received. Waiting on Frostbolt's side — nothing is lost if it never arrives.",
  },
  {
    id: "m3", reportsReceived: 2, a: { playerId: "p7", name: "Lilbow", wowClass: "hunter" },
    b: { playerId: "p9", name: "Dotz", wowClass: "warlock" },
    winnerId: "p7", scoreA: 2, scoreB: 0, bestOf: 3,
    ladder: null, rulesetName: "Fieldcraft", standard: false,
    status: "received", evidence: "peer_supported",
    games: [
      { index: 0, winnerId: "p7", reason: "death", voided: false },
      { index: 1, winnerId: "p7", reason: "death", voided: false },
    ],
    playedAtMs: now - 26 * H, receivedAtMs: now - 25 * H,
    ratedAtMs: null, ratingDelta: null, weightPercent: 0,
    note: "Custom ruleset — tracked as a match, never affects Standard rating.",
  },
  {
    id: "m4", reportsReceived: 2, a: { playerId: "p1", name: "Mangler", wowClass: "warrior" },
    b: { playerId: "p5", name: "Shadowmend", wowClass: "priest" },
    winnerId: null, scoreA: 1, scoreB: 1, bestOf: 3,
    ladder: "open", rulesetName: "Ranked Standard", standard: true,
    status: "under_review", evidence: "disputed",
    games: [
      { index: 0, winnerId: "p1", reason: "death", voided: false },
      { index: 1, winnerId: "p5", reason: "death", voided: false },
      { index: 2, winnerId: null, reason: "conflicting_reports", voided: false },
    ],
    playedAtMs: now - 2 * D, receivedAtMs: now - 2 * D + 60_000,
    ratedAtMs: null, ratingDelta: null, weightPercent: 100,
    note: "Both sides reported different winners for game 3. A referee is reviewing — no rating either way yet.",
  },
];

export const RULESETS: Ruleset[] = [
  {
    id: "rs-std", name: "Ranked Standard", preset: "standard",
    standardEligible: true, immutable: true,
    coverageNote: "Detector coverage: consumables + engineering observed via combat log where permitted; rest is attested. Coverage shown before every match.",
    rules: [
      { id: "r1", category: "consumable", action: "deny", phase: "active", itemExceptions: [] },
      { id: "r2", category: "engineering", action: "deny", phase: "active",
        itemExceptions: [{ id: 0, name: "— none —" }] },
      { id: "r3", category: "world_buff", action: "deny", phase: "ready", itemExceptions: [] },
      { id: "r4", category: "food_drink", action: "allow", phase: "between_games", itemExceptions: [] },
    ],
  },
  {
    id: "rs-pure", name: "Pure Duel", preset: "pure_duel",
    standardEligible: false, immutable: false,
    coverageNote: "No items, no consumables, no engineering — skills only.",
    rules: [
      { id: "p1", category: "consumable", action: "deny", phase: "active", itemExceptions: [] },
      { id: "p2", category: "trinket", action: "deny", phase: "active", itemExceptions: [] },
      { id: "p3", category: "engineering", action: "deny", phase: "active", itemExceptions: [] },
      { id: "p4", category: "pet", action: "deny", phase: "active", itemExceptions: [] },
      { id: "p5", category: "equipment_swap", action: "deny", phase: "active", itemExceptions: [] },
    ],
  },
  {
    id: "rs-any", name: "Anything Goes", preset: "anything_goes",
    standardEligible: false, immutable: false,
    coverageNote: "No restrictions. Results are recorded but never Standard-rated.",
    rules: [],
  },
];

export const EVENTS: ClubEvent[] = [
  {
    id: "e1", name: "Friday Fight Night", kind: "fight_night",
    whenMs: now + 2 * D, venue: "Gadgetzan courtyard",
    status: "upcoming",
    description: "Open challenge board all evening. Standard rules, best-of-3, walk up and fight. Identity check-ins available at the desk.",
    signups: 14, cap: 32,
    staff: [
      { name: "Mangler", role: "organizer", playerId: "p1", wowClass: "warrior" },
      { name: "Sneakthief", role: "referee", playerId: "p2", wowClass: "rogue" },
      { name: "Holydin", role: "referee", playerId: "p4", wowClass: "paladin" },
    ],
  },
  {
    id: "e2", name: "Rookie Night", kind: "rookie_night",
    whenMs: now + 5 * D, venue: "Durotar — outside Orgrimmar",
    status: "upcoming",
    description: "New to dueling? Volunteers run coached practice duels. No rating pressure — just learn.",
    signups: 9, cap: 24,
    staff: [{ name: "Mangler", role: "organizer", playerId: "p1", wowClass: "warrior" }],
  },
  {
    id: "e3", name: "Mirror Cup — Mages", kind: "mirror_cup",
    whenMs: now + 9 * D, venue: "Steamwheedle arena",
    status: "upcoming",
    description: "Same-class bracket. Mirror ladder points on the line.",
    signups: 6, cap: 16,
    staff: [
      { name: "Frostbolt", role: "organizer", playerId: "p3", wowClass: "mage" },
      { name: "Sneakthief", role: "referee", playerId: "p2", wowClass: "rogue" },
    ],
  },
];

/** Opt-in world-PvP journals (docs/10) — pilot numbers; scoring is gated
 *  on client capability probes, so `scoringLive` stays false. */
export const WORLD: WorldBoard = {
  scoringLive: false,
  war: [
    { rank: 1, playerId: "p1", name: "Mangler", wowClass: "warrior", points: 34, reports: 11 },
    { rank: 2, playerId: "p2", name: "Sneakthief", wowClass: "rogue", points: 27, reports: 9 },
    { rank: 3, playerId: "p6", name: "Moonfire", wowClass: "druid", points: 22, reports: 8 },
    { rank: 4, playerId: "p3", name: "Frostbolt", wowClass: "mage", points: 19, reports: 6 },
  ],
  pit: [
    { rank: 1, playerId: "p2", name: "Sneakthief", wowClass: "rogue", points: 12, reports: 4 },
    { rank: 2, playerId: "p5", name: "Shadowmend", wowClass: "priest", points: 9, reports: 3 },
  ],
};

export const STATUS: SiteStatus = {
  configVersion: "beta-v2",
  generatedAtMs: now - 15 * 60_000,
  ratingGeneration: { id: "gen-2026-09-21-07", computedAtMs: now - 45 * 60_000, seriesCounted: 128 },
  capabilities: [
    { id: "duel-detect", label: "Duel outcome detection", status: "partial",
      note: "DUEL_FINISHED observed; winner attribution pending two-client probe." },
    { id: "peer-sync", label: "Peer addon messaging", status: "unknown",
      note: "WHISPER channel throttles measured next lab session." },
    { id: "sv-flush", label: "SavedVariables flush on /reload", status: "working",
      note: "Confirmed on beta client build 69913." },
    { id: "companion", label: "Companion auto-upload", status: "partial",
      note: "Companion prototype works on test files; live WoW path pending." },
    { id: "cross-faction", label: "Cross-faction addon chat", status: "unknown",
      note: "Not yet probed — Horde/Alliance relay may be required." },
  ],
};

export const SERVER_NOW = now;
