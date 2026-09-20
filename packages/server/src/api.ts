/**
 * api.ts — HTTP API surface for the uploader + website (docs/27, 12).
 *
 * Route handlers are pure (deps injected, req/resp as values) so they run
 * under vitest without sockets; serve.ts wraps them in node:http.
 *
 * Auth model:
 * - helper credential: `Authorization: Bearer <token>` issued by device
 *   pairing. Scoped to report submission + own receipts/status only.
 * - app session: `Authorization: Bearer <token>` issued by dev login for
 *   the website. Pairing approval requires a session for the account.
 * - read endpoints are public (community boards), never leak account data
 *   beyond what the site shows anyway.
 */

import { randomUUID, randomInt, createHash, timingSafeEqual } from "node:crypto";
import {
  decodeExport, encodeUpdate, validateSyncEnvelope,
  type PublishedRuleset, type SyncEnvelope,
} from "@acl/contracts";
import { ingestEnvelope, type AuthContext } from "./ingest.js";
import { buildAddonUpdate, type SnapshotSource } from "./snapshot.js";
import type { GenerationRunner } from "./generation.js";
import type { RateLimiter } from "./ratelimit.js";
import type { Store } from "./store.js";
import type { InMemoryStore } from "./memory.js";

// ---------------------------------------------------------------------------
// deps

export interface DeviceCredential {
  token: string;
  accountId: string;
  installationId: string;
  issuedAtMs: number;
  revoked: boolean;
}

export interface PairRequest {
  deviceCode: string;
  userCode: string;
  installationId: string;
  expiresAtMs: number;
  approvedAccountId: string | null;
  /** Set once the device credential was issued — single-use. */
  consumedAtMs: number | null;
}

export interface SessionToken {
  token: string;
  accountId: string;
  issuedAtMs: number;
}

/** Auth + pairing state. Postgres impl comes with the DB binding. */
export interface AuthStore {
  savePair(req: PairRequest): Promise<void>;
  getPair(deviceCode: string): Promise<PairRequest | null>;
  getPairByUserCode(userCode: string): Promise<PairRequest | null>;
  /** Approve the code for an account; false if already approved or consumed. */
  approvePair(deviceCode: string, accountId: string): Promise<boolean>;
  /** Mark the pair consumed once its credential has been issued. */
  consumePair(deviceCode: string): Promise<void>;
  saveDevice(c: DeviceCredential): Promise<void>;
  getDevice(token: string): Promise<DeviceCredential | null>;
  revokeDevice(token: string): Promise<void>;
  saveSession(s: SessionToken): Promise<void>;
  getSession(token: string): Promise<SessionToken | null>;
}

const tokenDigest = (t: string) => createHash("sha256").update(t).digest("hex");

export class InMemoryAuthStore implements AuthStore {
  pairs = new Map<string, PairRequest>();
  /** keyed by sha256(token) — raw tokens never persist, even in dev */
  devices = new Map<string, DeviceCredential>();
  sessions = new Map<string, SessionToken>();
  async savePair(r: PairRequest) { this.pairs.set(r.deviceCode, r); }
  async getPair(c: string) { return this.pairs.get(c) ?? null; }
  async getPairByUserCode(u: string) {
    const b = Buffer.from(u);
    for (const p of this.pairs.values()) {
      const a = Buffer.from(p.userCode);
      if (a.length === b.length && timingSafeEqual(a, b)) return p;
    }
    return null;
  }
  async approvePair(deviceCode: string, accountId: string) {
    const p = this.pairs.get(deviceCode);
    if (!p || p.approvedAccountId !== null || p.consumedAtMs !== null) return false;
    p.approvedAccountId = accountId;
    return true;
  }
  async consumePair(deviceCode: string) {
    const p = this.pairs.get(deviceCode);
    if (p) p.consumedAtMs = Date.now();
  }
  async saveDevice(c: DeviceCredential) { this.devices.set(tokenDigest(c.token), c); }
  async getDevice(t: string) { return this.devices.get(tokenDigest(t)) ?? null; }
  async revokeDevice(t: string) {
    const d = this.devices.get(tokenDigest(t));
    if (d) d.revoked = true;
  }
  async saveSession(s: SessionToken) { this.sessions.set(tokenDigest(s.token), s); }
  async getSession(t: string) { return this.sessions.get(tokenDigest(t)) ?? null; }
}

/** A match-list row — the shape the site's match cards render (docs/12). */
export interface MatchIndexEntry {
  id: string;
  a: { playerId: string; name: string; wowClass: string };
  b: { playerId: string; name: string; wowClass: string };
  winnerId: string | null;
  scoreA: number; scoreB: number;
  bestOf: number;
  ladder: string | null;
  rulesetName: string;
  standard: boolean;
  /** doc 12 status language */
  status: "recorded_locally" | "saved_for_upload" | "received"
    | "awaiting_opponent" | "under_review" | "rated";
  evidence: "corroborated" | "peer_supported" | "referee" | "disputed";
  reportsReceived: number;
  playedAtMs: number;
  receivedAtMs: number | null;
}

/** Read-side queries beyond the write Store. Memory impl for dev/tests. */
export interface ReadModel {
  leaderboard(seasonId: string, ladder: "open" | "mirror"): Promise<{
    rank: number; playerId: string; name: string; wowClass: string;
    rating: number; wins: number; losses: number;
    placement: { seriesDone: number; seriesNeeded: number;
      opponentsDone: number; opponentsNeeded: number } | null;
    tier: string;
  }[]>;
  matchesIndex(limit?: number): Promise<MatchIndexEntry[]>;
  matchDetail(matchId: string): Promise<unknown | null>;
  playerDetail(playerId: string): Promise<unknown | null>;
  /** The signed-in account's own characters — backs GET /v1/me. */
  myCharacters(accountId: string): Promise<{
    id: string; name: string; classId: number; verificationTier: string;
  }[]>;
  /** Immutable published ruleset versions (docs/08); newest per ruleset. */
  rulesets(): Promise<PublishedRuleset[]>;
  siteStatus(): Promise<unknown>;
}

/** An event board row — the shape the site's event cards render (docs/12). */
export interface ApiEvent {
  id: string;
  name: string;
  kind: "fight_night" | "mirror_cup" | "rookie_night" | "gurubashi";
  whenMs: number;
  venue: string;
  status: "upcoming" | "live" | "done";
  description: string;
  signups: number;
  cap: number;
  /** The account that created the event — organizer authority lives here. */
  organizerAccountId?: string;
  /** Organizer-designated staff (event_staff) — referees rule disputes and
   *  run identity check-ins; "witness" exists only in this scope.
   *  `name` is the staff member's character name (their registered
   *  character for the event if any, else their best-verified one);
   *  `playerId`/`wowClass` link and color it. Falls back to the public
   *  slug when the profile has no character. */
  staff?: {
    name: string; role: "organizer" | "referee";
    playerId?: string; wowClass?: string;
  }[];
}

export type SignupResult = "ok" | "full" | "closed" | "duplicate" | "no_character";
export type AddStaffResult = "ok" | "not_organizer" | "no_event" | "no_character";

export interface NewEventInput {
  name: string;
  kind: ApiEvent["kind"];
  whenMs: number;
  venue: string;
  cap: number;
  description: string;
}

/** Community events: list, one-signup-per-account registration, and
 *  organizer self-service (create + designate staff). Creating an event
 *  makes the creator its organizer; only the organizer can designate
 *  referees — the only scope in which "witness" check-ins exist. */
export interface EventBoard {
  list(accountId?: string | null): Promise<(ApiEvent & { registered?: boolean; managedByMe?: boolean })[]>;
  create(input: NewEventInput, organizerAccountId: string): Promise<ApiEvent>;
  addStaff(eventId: string, actorAccountId: string, staffAccountId: string,
    role: "organizer" | "referee"): Promise<AddStaffResult>;
  signup(eventId: string, accountId: string, characterId: string | null): Promise<SignupResult>;
}

/** staff storage is account-scoped; display resolves to a character. */
interface StaffRow { accountId: string; role: "organizer" | "referee" }

export class InMemoryEventBoard implements EventBoard {
  events = new Map<string, ApiEvent>();
  /** eventId -> accountIds (one signup per linked account, per schema) */
  signups = new Map<string, Set<string>>();
  /** eventId -> designated staff (account + role) */
  staffRows = new Map<string, StaffRow[]>();
  /** eventId -> organizer's account */
  organizers = new Map<string, string>();

  constructor(private readonly s: InMemoryStore,
    private readonly names?: Map<string, string>) {}

  seed(e: ApiEvent): void {
    this.events.set(e.id, e);
    this.signups.set(e.id, new Set());
    if (e.organizerAccountId) this.organizers.set(e.id, e.organizerAccountId);
    // seeds carry resolved staff (character name + playerId); keep the raw
    // rows so addStaff dedupes and organizer checks work
    if (e.staff) {
      this.staffRows.set(e.id, e.staff.map((st) => ({
        accountId: st.playerId
          ? (this.s.characters.get(st.playerId)?.accountId ?? st.playerId)
          : st.name,
        role: st.role,
      })));
    }
  }

  private staffDisplay(eventId: string): NonNullable<ApiEvent["staff"]> {
    const cls: Record<number, string> = {
      1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
      6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
    };
    return (this.staffRows.get(eventId) ?? []).map((st) => {
      const chars = [...this.s.characters.values()]
        .filter((c) => c.accountId === st.accountId)
        .sort((a, b) =>
          (({ claimed: 2, witnessed: 1, provider_verified: 0 }) as const)[b.verificationTier]
          - (({ claimed: 2, witnessed: 1, provider_verified: 0 }) as const)[a.verificationTier]
          || b.level - a.level);
      const ch = chars[0];
      return ch
        ? { name: this.names?.get(ch.id) ?? ch.id, role: st.role,
            playerId: ch.id, wowClass: cls[ch.classId] ?? "unknown" }
        : { name: st.accountId, role: st.role };
    });
  }

  async list(accountId?: string | null) {
    return [...this.events.values()]
      .map((e) => ({
        ...e,
        signups: e.signups + (this.signups.get(e.id)?.size ?? 0),
        staff: this.staffDisplay(e.id),
        ...(accountId ? {
          registered: this.signups.get(e.id)?.has(accountId) ?? false,
          managedByMe: this.organizers.get(e.id) === accountId,
        } : {}),
      }))
      .sort((a, b) => a.whenMs - b.whenMs);
  }

  async create(input: NewEventInput, organizerAccountId: string): Promise<ApiEvent> {
    const e: ApiEvent = {
      id: randomUUID(), ...input, status: "upcoming", signups: 0,
      organizerAccountId,
    };
    this.events.set(e.id, e);
    this.signups.set(e.id, new Set());
    this.organizers.set(e.id, organizerAccountId);
    this.staffRows.set(e.id, [{ accountId: organizerAccountId, role: "organizer" }]);
    return e;
  }

  async addStaff(eventId: string, actorAccountId: string, staffAccountId: string,
    role: "organizer" | "referee"): Promise<AddStaffResult> {
    if (!this.events.has(eventId)) return "no_event";
    if (this.organizers.get(eventId) !== actorAccountId) return "not_organizer";
    const hasChar = [...this.s.characters.values()].some((c) => c.accountId === staffAccountId);
    if (!hasChar) return "no_character";
    const rows = this.staffRows.get(eventId) ?? [];
    if (!rows.some((r) => r.accountId === staffAccountId && r.role === role)) {
      rows.push({ accountId: staffAccountId, role });
    }
    this.staffRows.set(eventId, rows);
    return "ok";
  }

  async signup(eventId: string, accountId: string, characterId: string | null): Promise<SignupResult> {
    const e = this.events.get(eventId);
    if (!e || e.status === "done") return "closed";
    const set = this.signups.get(eventId) ?? new Set<string>();
    if (set.has(accountId)) return "duplicate";
    if (set.size >= e.cap) return "full";
    // resolve character: explicit pick must belong to the account; otherwise
    // use the account's best-verified character
    let charId = characterId;
    if (charId) {
      const ch = await this.s.getCharacter(charId);
      if (!ch || ch.accountId !== accountId) return "no_character";
    } else {
      const mine = [...this.s.characters.values()]
        .filter((c) => c.accountId === accountId)
        .sort((a, b) => (b.verificationTier === "provider_verified" ? 1 : 0)
          - (a.verificationTier === "provider_verified" ? 1 : 0)
          || (b.verificationTier === "witnessed" ? 1 : 0)
          - (a.verificationTier === "witnessed" ? 1 : 0));
      charId = mine[0]?.id ?? null;
    }
    if (!charId) return "no_character";
    set.add(accountId);
    this.signups.set(eventId, set);
    return "ok";
  }
}

/** World PvP board — opt-in war/pit journals (docs/10, 0005 world tables).
 *  Scores are gated on client probes; `scoringLive` says whether points
 *  count yet or this is journal-only. */
export interface WorldBoardEntry {
  rank: number; playerId: string; name: string; wowClass: string;
  points: number; reports: number;
}
export interface WorldBoard {
  list(seasonId: string): Promise<{
    war: WorldBoardEntry[]; pit: WorldBoardEntry[];
    scoringLive: boolean;
  }>;
}

export class InMemoryWorldBoard implements WorldBoard {
  war: WorldBoardEntry[] = [];
  pit: WorldBoardEntry[] = [];
  scoringLive = false;
  seed(domain: "war" | "pit", rows: Omit<WorldBoardEntry, "rank">[]): void {
    this[domain] = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }
  async list() {
    return { war: this.war, pit: this.pit, scoringLive: this.scoringLive };
  }
}

export interface ApiDeps {
  store: Store;
  auth: AuthStore;
  reads: ReadModel;
  events: EventBoard;
  world: WorldBoard;
  /** WFU1 bundle builder source — receipts, snapshots, published rulesets. */
  snapshots: SnapshotSource;
  configVersion: string;
  verifyUrlBase: string;   // e.g. https://site/pair
  seasonId: string;
  /** Debounced rating-generation runner; absent = generation disabled. */
  generations?: GenerationRunner;
  /** Accounts allowed on /v1/admin/* — unset means nobody is admin. */
  adminAccounts?: ReadonlySet<string>;
  /** Request limiter; absent = unlimited (unit tests). */
  limiter?: RateLimiter;
}

// ---------------------------------------------------------------------------
// plumbing

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Client IP as seen by the server (post ACL_TRUST_PROXY resolution). */
  ip: string;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const json = (status: number, body: unknown,
  headers?: Record<string, string>): ApiResponse =>
  ({ status, body, ...(headers ? { headers } : {}) });

/** Fixed-window check; returns the 429 response or null when allowed. */
const limited = (deps: ApiDeps, key: string, limit: number,
  windowMs: number): ApiResponse | null => {
  const r = deps.limiter?.check(key, limit, windowMs);
  if (!r || r.ok) return null;
  return json(429, { error: "rate limited", retryAfterSec: r.retryAfterSec },
    { "retry-after": String(r.retryAfterSec) });
};

/**
 * POST /v1/session is a development account-id login — it exists only on the
 * seeded in-memory dev server or when ACL_DEV_LOGIN=1, never in Postgres mode.
 */
export function devLoginEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.ACL_DEV_LOGIN === "1") return true;
  return env.ACL_SEED !== "0" && !env.DATABASE_URL;
}

const bearer = (req: ApiRequest) =>
  req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7) : null;

async function helperAuth(deps: ApiDeps, req: ApiRequest): Promise<AuthContext | ApiResponse> {
  const token = bearer(req);
  if (!token) return json(401, { error: "missing credential" });
  const d = await deps.auth.getDevice(token);
  if (!d || d.revoked) return json(401, { error: "credential rejected — re-pair the companion" });
  return { accountId: d.accountId, installationId: d.installationId, authMethod: "helper" };
}

async function sessionAuth(deps: ApiDeps, req: ApiRequest): Promise<SessionToken | ApiResponse> {
  const token = bearer(req);
  if (!token) return json(401, { error: "sign in first" });
  const s = await deps.auth.getSession(token);
  if (!s) return json(401, { error: "session expired" });
  return s;
}

/** sessionAuth + membership in ACL_ADMIN_ACCOUNTS for /v1/admin/* routes. */
async function adminAuth(deps: ApiDeps, req: ApiRequest): Promise<SessionToken | ApiResponse> {
  const s = await sessionAuth(deps, req);
  if ("status" in s) return s;
  if (!deps.adminAccounts?.has(s.accountId)) return json(403, { error: "admin only" });
  return s;
}

// ---------------------------------------------------------------------------
// routes

export async function handleRequest(deps: ApiDeps, req: ApiRequest): Promise<ApiResponse> {
  const { method, path } = req;

  // --- pairing (docs/27 device flow) -------------------------------------
  if (method === "POST" && path === "/v1/pair/start") {
    const rl = limited(deps, `ip:${req.ip}:pair-start`, 10, 60_000);
    if (rl) return rl;
    const b = req.body as { installationId?: string };
    if (!b?.installationId) return json(400, { error: "installationId required" });
    const deviceCode = randomUUID();
    // 8 chars, Crockford-ish alphabet (no 0/O/1/I), crypto randomness
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const userCode = Array.from({ length: 8 }, () => ALPHABET[randomInt(32)]).join("");
    const expiresAtMs = Date.now() + 10 * 60_000;
    await deps.auth.savePair({
      deviceCode, userCode, installationId: b.installationId,
      expiresAtMs, approvedAccountId: null, consumedAtMs: null,
    });
    return json(200, {
      deviceCode, userCode,
      verifyUrl: `${deps.verifyUrlBase}?code=${userCode}`,
      pollIntervalMs: 2000, expiresAtMs,
    });
  }

  if (method === "POST" && path === "/v1/pair/poll") {
    const rl = limited(deps, `ip:${req.ip}:pair-poll`, 60, 60_000);
    if (rl) return rl;
    const b = req.body as { deviceCode?: string };
    const p = b?.deviceCode ? await deps.auth.getPair(b.deviceCode) : null;
    if (!p) return json(404, { error: "unknown device code" });
    if (Date.now() > p.expiresAtMs) return json(410, { error: "pairing expired" });
    if (p.consumedAtMs !== null) return json(410, { error: "code already used" });
    if (!p.approvedAccountId) return json(200, { status: "pending" });
    const token = "acld_" + randomUUID().replace(/-/g, "");
    await deps.auth.saveDevice({
      token, accountId: p.approvedAccountId,
      installationId: p.installationId, issuedAtMs: Date.now(), revoked: false,
    });
    await deps.auth.consumePair(p.deviceCode);
    return json(200, {
      status: "approved", token,
      accountId: p.approvedAccountId, expiresAtMs: Date.now() + 365 * 86400_000,
    });
  }

  if (method === "POST" && path === "/v1/pair/approve") {
    const s = await sessionAuth(deps, req);
    if ("status" in s) return s;
    const b = req.body as { userCode?: string };
    const p = b?.userCode ? await deps.auth.getPairByUserCode(b.userCode.toUpperCase()) : null;
    if (!p) return json(404, { error: "unknown code — check the letters on your device" });
    if (Date.now() > p.expiresAtMs) return json(410, { error: "code expired — start pairing again" });
    if (!(await deps.auth.approvePair(p.deviceCode, s.accountId)))
      return json(410, { error: "code already used" });
    return json(200, { status: "approved" });
  }

  if (method === "POST" && path === "/v1/pair/revoke") {
    const ctx = await helperAuth(deps, req);
    if ("status" in ctx) return ctx;
    await deps.auth.revokeDevice(bearer(req)!);
    return json(200, { status: "revoked" });
  }

  // --- report upload (companion + manual import share this path) ---------
  if (method === "POST" && path === "/v1/reports/batch") {
    const ctx = await helperAuth(deps, req);
    if ("status" in ctx) return ctx;
    const rl = limited(deps, `acct:${ctx.accountId}:batch`, 30, 60_000);
    if (rl) return rl;
    const b = req.body as { reports?: unknown[]; envelopes?: string[]; contracts?: unknown[] };
    const reports: unknown[] = [...(b?.reports ?? [])];
    // also accept raw WFP2 envelope strings (manual import path)
    for (const text of b?.envelopes ?? []) {
      try {
        const env = decodeExport(text) as unknown as SyncEnvelope;
        if (validateSyncEnvelope(env as never).length === 0) {
          reports.push(...env.reports);
        }
      } catch { /* skip unparseable line; counted below */ }
    }
    const envelope: SyncEnvelope = {
      schema: "wf.sync-envelope.v2",
      installationId: ctx.installationId ?? "00000000-0000-4000-8000-000000000000",
      build: "companion", addonVersion: "0",
      exportedAtMs: Date.now(),
      reports: reports as never,
    };
    const contracts = new Map<string, never>();
    for (const c of b?.contracts ?? []) {
      const doc = c as { sessionId?: string };
      if (doc.sessionId) contracts.set(doc.sessionId, c as never);
    }
    const res = await ingestEnvelope(deps.store, ctx, {
      envelope, contracts: contracts as never,
    });
    let accepted = 0, already = 0, attention = 0;
    for (const it of res.items) {
      if (it.status === "duplicate") already++;
      else if (it.status === "rejected") attention++;
      else accepted++;
    }
    // ingest already bumped the season input revision in exactly these cases
    if (res.items.some((i) => i.status === "rating_pending" || i.status === "disputed")) {
      deps.generations?.schedule(deps.seasonId);
    }
    return json(200, {
      accepted, alreadyReceived: already, needsAttention: attention,
      receipts: res.items.map((i) => ({
        nonce: i.nonce, receiptId: res.receiptId, status: i.status,
      })),
      serverTime: res.serverTime, configVersion: deps.configVersion,
    });
  }

  // --- admin: force a rating rebuild for the current season --------------
  if (method === "POST" && path === "/v1/admin/regenerate") {
    const s = await adminAuth(deps, req);
    if ("status" in s) return s;
    const rl = limited(deps, `acct:${s.accountId}:admin`, 5, 60_000);
    if (rl) return rl;
    if (!deps.generations) return json(503, { error: "generations disabled" });
    return json(200, await deps.generations.runNow(deps.seasonId));
  }

  // --- dev session (placeholder until Battle.net OAuth lands) ------------
  if (method === "POST" && path === "/v1/session") {
    const rl = limited(deps, `ip:${req.ip}:session`, 20, 60_000);
    if (rl) return rl;
    // account-id login is dev-only; in production it does not exist
    if (!devLoginEnabled(process.env)) return json(404, { error: "not found" });
    const b = req.body as { accountId?: string };
    if (!b?.accountId) return json(400, { error: "accountId required" });
    const token = "acls_" + randomUUID().replace(/-/g, "");
    await deps.auth.saveSession({ token, accountId: b.accountId, issuedAtMs: Date.now() });
    return json(200, { token, accountId: b.accountId });
  }

  // --- who am I: the session's account + its characters -------------------
  if (method === "GET" && path === "/v1/me") {
    const s = await sessionAuth(deps, req);
    if ("status" in s) return s;
    return json(200, {
      accountId: s.accountId,
      characters: await deps.reads.myCharacters(s.accountId),
    });
  }

  // --- reads --------------------------------------------------------------
  if (method === "GET" && path === "/v1/leaderboard") {
    const ladder = req.query.ladder === "mirror" ? "mirror" : "open";
    return json(200, {
      ladder, seasonId: deps.seasonId,
      entries: await deps.reads.leaderboard(deps.seasonId, ladder),
    });
  }
  if (method === "GET" && path === "/v1/matches") {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
    return json(200, {
      matches: await deps.reads.matchesIndex(limit),
      generatedAtMs: Date.now(),
    });
  }
  const matchM = path.match(/^\/v1\/match\/([0-9a-fA-F-]+)$/);
  if (method === "GET" && matchM) {
    const m = await deps.reads.matchDetail(matchM[1]!);
    return m ? json(200, m) : json(404, { error: "match not found" });
  }
  const playerM = path.match(/^\/v1\/player\/([0-9a-fA-F-]+)$/);
  if (method === "GET" && playerM) {
    const p = await deps.reads.playerDetail(playerM[1]!);
    return p ? json(200, p) : json(404, { error: "player not found" });
  }
  if (method === "GET" && path === "/v1/events") {
    // optional session — marks which events the caller already joined
    const s = bearer(req) ? await deps.auth.getSession(bearer(req)!) : null;
    return json(200, {
      events: await deps.events.list(s?.accountId ?? null),
      generatedAtMs: Date.now(),
    });
  }

  const signupM = path.match(/^\/v1\/events\/([0-9a-fA-F-]+)\/signup$/);
  if (method === "POST" && signupM) {
    const s = await sessionAuth(deps, req);
    if ("status" in s) return s;
    const rl = limited(deps, `acct:${s.accountId}:events`, 20, 60_000);
    if (rl) return rl;
    const b = req.body as { characterId?: string };
    const res = await deps.events.signup(signupM[1]!, s.accountId, b?.characterId ?? null);
    const status = res === "ok" ? 200 : res === "duplicate" ? 200
      : res === "full" ? 409 : res === "no_character" ? 422 : 410;
    const messages: Record<SignupResult, string> = {
      ok: "signed up",
      duplicate: "already signed up",
      full: "event is full",
      closed: "event has ended or does not exist",
      no_character: "no verified character on this account",
    };
    return json(status, { status: res, message: messages[res] });
  }

  // Community-run events: any signed-in player can organize one; the
  // creator becomes its organizer (docs/10).
  if (method === "POST" && path === "/v1/events") {
    const s = await sessionAuth(deps, req);
    if ("status" in s) return s;
    const rl = limited(deps, `acct:${s.accountId}:events`, 20, 60_000);
    if (rl) return rl;
    const b = req.body as Partial<NewEventInput> | undefined;
    const kinds = ["fight_night", "mirror_cup", "rookie_night", "gurubashi"];
    if (!b?.name || !b.kind || !kinds.includes(b.kind) || !b.whenMs || !b.cap)
      return json(400, { error: "name, kind, whenMs, cap required" });
    const cap = Math.floor(Number(b.cap));
    if (!(cap >= 1 && cap <= 512)) return json(400, { error: "cap must be 1–512" });
    const e = await deps.events.create({
      name: String(b.name).slice(0, 120),
      kind: b.kind, whenMs: Number(b.whenMs),
      venue: String(b.venue ?? "").slice(0, 120),
      cap, description: String(b.description ?? "").slice(0, 2000),
    }, s.accountId);
    return json(201, { event: e });
  }

  const staffM = path.match(/^\/v1\/events\/([0-9a-fA-F-]+)\/staff$/);
  if (method === "POST" && staffM) {
    const s = await sessionAuth(deps, req);
    if ("status" in s) return s;
    const rl = limited(deps, `acct:${s.accountId}:events`, 20, 60_000);
    if (rl) return rl;
    const b = req.body as { accountId?: string; role?: string } | undefined;
    const role = b?.role === "organizer" ? "organizer" : "referee";
    if (!b?.accountId) return json(400, { error: "accountId required" });
    const res = await deps.events.addStaff(staffM[1]!, s.accountId, b.accountId, role);
    const status = res === "ok" ? 200 : res === "not_organizer" ? 403
      : res === "no_character" ? 422 : 404;
    const messages: Record<AddStaffResult, string> = {
      ok: "staff designated",
      not_organizer: "only the event organizer can designate staff",
      no_event: "event not found",
      no_character: "no character on that account",
    };
    return json(status, { status: res, message: messages[res] });
  }

  if (method === "GET" && path === "/v1/world") {
    return json(200, {
      ...(await deps.world.list(deps.seasonId)),
      generatedAtMs: Date.now(),
    });
  }

  // --- addon update bundle (companion polls after upload; docs/06, 27) ---
  if (method === "GET" && path === "/v1/addon-update") {
    const ctx = await helperAuth(deps, req);
    if ("status" in ctx) return ctx;
    const { bundle, hasMoreReceipts } = await buildAddonUpdate(
      deps.snapshots, ctx.accountId, req.query.idem ?? randomUUID(), {
        ...(req.query.receiptCursor ? { receiptCursor: req.query.receiptCursor } : {}),
        configVersion: deps.configVersion,
      });
    return json(200, {
      update: encodeUpdate(bundle as never),
      snapshotSequence: bundle.snapshotSequence,
      hasMoreReceipts,
    });
  }

  if (method === "GET" && path === "/v1/rulesets") {
    return json(200, {
      rulesets: await deps.reads.rulesets(),
      generatedAtMs: Date.now(),
    });
  }

  if (method === "GET" && path === "/v1/status") {
    const base = await deps.reads.siteStatus() as Record<string, unknown>;
    const gen = deps.generations?.latest(deps.seasonId) ?? null;
    return json(200, {
      ...base,
      ratingGeneration: gen
        ? { id: gen.generationId, computedAtMs: gen.computedAtMs,
            seriesCounted: gen.events }
        : null,
    });
  }

  return json(404, { error: "not found" });
}
