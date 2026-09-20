/**
 * serve.ts — HTTP server: node:http wrapper + store wiring.
 *
 *   pnpm --filter @acl/server dev              # :8787, seeded demo data
 *   ACL_SEED=0 pnpm --filter @acl/server dev   # empty store
 *   DATABASE_URL=... pnpm --filter @acl/server dev   # Postgres mode
 *
 * DATABASE_URL selects the Postgres bindings (supabase/migrations); the
 * in-memory seeded store is the development surface.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import pg from "pg";
import { InMemoryStore } from "./memory.js";
import { InMemoryReadModel, InMemorySnapshotSource } from "./reads.js";
import {
  PgAuthStore, PgEventBoard, PgReadModel, PgSnapshotSource, PgStore, PgWorldBoard,
} from "./pg.js";
import { InMemoryAuthStore, InMemoryEventBoard, InMemoryWorldBoard, handleRequest, type ApiDeps, type ApiRequest } from "./api.js";
import { ingestEnvelope, type AuthContext } from "./ingest.js";
import { GenerationRunner } from "./generation.js";
import { RateLimiter } from "./ratelimit.js";
import type { MatchContract, MatchReport, PublishedRuleset } from "@acl/contracts";
import { hashCanonical } from "@acl/contracts";
import type { CharacterRow } from "./store.js";

const PORT = Number(process.env.ACL_PORT ?? 8787);
export const SEASON = process.env.ACL_SEASON ?? "00000000-0000-4000-8000-0000000000aa";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DAY = 86400_000;

/** The seeded demo contract — deterministic so dev clients can reproduce its hash. */
export function seedContract(): MatchContract {
  return {
    schema: "wf.match-contract.v2", sessionId: U(1), seasonId: SEASON,
    poolId: U(2), ladder: "open", ratedIntent: true, bestOf: 3,
    rulesetVersionId: U(3),
    participants: [{ characterId: U(5), side: 1 }, { characterId: U(6), side: 2 }],
    levelMin: 60, levelMax: 60,
    venue: { kind: "anywhere", mapId: null, areaId: null },
    tournamentMatchId: null,
    createdAtMs: 1700000000000, acceptByMs: 1700003600000,
    configVersion: "beta-v2",
  };
}

/** The seeded Standard ruleset — mirrors the addon's `standard` template.
 *  versionId U(3) matches the seeded contract's rulesetVersionId so match
 *  cards can resolve a real name. */
export function seedRuleset(): PublishedRuleset {
  return {
    rulesetId: U(30), versionId: U(3), version: 1,
    name: "Ranked Standard",
    description: "Class abilities, self buffs, bandages. No active-game consumables or engineering.",
    standard: true,
    rules: [
      { ruleId: "std.consumables", category: "consumable", action: "deny",
        phase: "active", detectorId: "combat_log.use", sanction: "game_loss" },
      { ruleId: "std.engineering", category: "engineering", action: "deny",
        phase: "active", detectorId: "combat_log.use", sanction: "game_loss" },
      { ruleId: "std.worldbuffs", category: "world_buff", action: "deny",
        phase: "ready", detectorId: "aura.inspect", sanction: "game_loss" },
      { ruleId: "std.outside", category: "outside_assistance", action: "deny",
        phase: "active", detectorId: "combat_log.source", sanction: "void_game" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Deterministic dev seed — real ingest path, seeded PRNG, honest data.

interface SeedChar {
  id: string; account: string; name: string; classId: number;
  tier: CharacterRow["verificationTier"];
  /** Hidden skill — biases outcomes so the board has a stable order. */
  skill: number;
}

const SEED_CHARS: SeedChar[] = [
  { id: U(5),  account: "acct-a", name: "Mangler",    classId: 1, tier: "provider_verified", skill: 10 },
  { id: U(6),  account: "acct-b", name: "Sneakthief", classId: 4, tier: "witnessed",         skill: 9 },
  { id: U(7),  account: "acct-c", name: "Frostbolt",  classId: 7, tier: "witnessed",         skill: 8 },
  { id: U(8),  account: "acct-d", name: "Holydin",    classId: 2, tier: "provider_verified", skill: 7 },
  { id: U(9),  account: "acct-e", name: "Shadowmend", classId: 5, tier: "witnessed",         skill: 6 },
  { id: U(10), account: "acct-f", name: "Moonfire",   classId: 9, tier: "witnessed",         skill: 5 },
  { id: U(11), account: "acct-g", name: "Totemcall",  classId: 6, tier: "provider_verified", skill: 4 },
  { id: U(12), account: "acct-h", name: "Manglepaw",  classId: 9, tier: "witnessed",         skill: 3 },
  { id: U(13), account: "acct-i", name: "Lilbow",     classId: 3, tier: "witnessed",         skill: 2 },
  // claimed tier — deliberately never rating-eligible (honest unverified path)
  { id: U(14), account: "acct-j", name: "Dotz",       classId: 8, tier: "claimed",           skill: 1 },
];

/** Fixed-seed LCG — pairings and outcomes are identical across restarts. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

type SeriesMode = "agree" | "dispute" | "solo";
interface SeriesPlan {
  a: number; b: number; ladder: "open" | "mirror";
  /** days before startup */
  dayOff: number; mode: SeriesMode;
}

/** ~56 series over the last 21 days; every pair repeats ≤3x so all weights stay positive. */
function seedPlan(): SeriesPlan[] {
  const plan: SeriesPlan[] = [];
  // established core (Mangler..Moonfire): two full round-robins, weeks 1+2
  const rr: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [0, 2], [1, 4],
    [3, 5], [0, 4], [1, 3], [2, 5], [0, 5],
    [1, 2], [3, 4], [0, 3], [1, 5], [2, 4],
  ];
  rr.forEach(([a, b], i) =>
    plan.push({ a, b, ladder: "open", dayOff: -21 + (i % 7), mode: "agree" }));
  rr.forEach(([a, b], i) =>
    plan.push({ a, b, ladder: "open", dayOff: -14 + (i % 7), mode: "agree" }));
  // third week: a few extra pairings -> 11-12 positive series, 6+ opponents
  for (const [a, b] of [[0, 5], [1, 4], [2, 3], [0, 3], [1, 5], [2, 4]] as [number, number][]) {
    plan.push({ a, b, ladder: "open", dayOff: -7 + (a + b) % 3, mode: "agree" });
  }
  // placing chars: a handful of open series each — below the 10-series bar
  plan.push(
    { a: 6, b: 0, ladder: "open", dayOff: -12, mode: "agree" },
    { a: 6, b: 3, ladder: "open", dayOff: -9, mode: "agree" },
    { a: 6, b: 5, ladder: "open", dayOff: -5, mode: "agree" },
    { a: 7, b: 1, ladder: "open", dayOff: -11, mode: "agree" },
    { a: 7, b: 4, ladder: "open", dayOff: -8, mode: "agree" },
    { a: 7, b: 2, ladder: "open", dayOff: -4, mode: "agree" },
    { a: 8, b: 0, ladder: "open", dayOff: -10, mode: "agree" },
    { a: 8, b: 2, ladder: "open", dayOff: -6, mode: "agree" },
    { a: 8, b: 4, ladder: "open", dayOff: -3, mode: "agree" },
  );
  // mirror ladder: the two druids, six series across the window
  for (const d of [-18, -13, -9, -6, -3, -1]) {
    plan.push({ a: 5, b: 7, ladder: "mirror", dayOff: d, mode: "agree" });
  }
  // two disputed series — reports disagree on a game winner
  plan.push(
    { a: 0, b: 1, ladder: "open", dayOff: -4, mode: "dispute" },
    { a: 2, b: 3, ladder: "open", dayOff: -2, mode: "dispute" },
  );
  // two one-sided series — awaiting the peer's report
  plan.push(
    { a: 6, b: 8, ladder: "open", dayOff: -3, mode: "solo" },
    { a: 3, b: 8, ladder: "open", dayOff: -1, mode: "solo" },
  );
  // one corroborated series with Dotz — claimed tier, so rating-ineligible
  plan.push({ a: 9, b: 6, ladder: "open", dayOff: -5, mode: "agree" });
  return plan.sort((x, y) => x.dayOff - y.dayOff);
}

/**
 * Deterministic dev seed: ten characters, ~56 series ingested through the
 * real envelope path so every match carries genuine corroborated reports.
 * Pairings/outcomes come from a fixed-seed LCG biased by hidden skill;
 * timestamps spread over the last 21 days relative to startup.
 */
export async function seedDev(store: InMemoryStore, reads: InMemoryReadModel,
  seed = 6): Promise<void> {
  for (const c of SEED_CHARS) {
    store.characters.set(c.id, {
      id: c.id, accountId: c.account, classId: c.classId,
      level: 60, verificationTier: c.tier,
    });
    reads.names.set(c.id, c.name);
  }
  reads.seedRuleset(seedRuleset());

  const rnd = lcg(seed);
  const base = Date.now();
  const idx = (c: SeedChar) => SEED_CHARS.indexOf(c);
  const inst = (c: SeedChar) => U(50 + idx(c));
  const auth = (c: SeedChar): AuthContext =>
    ({ accountId: c.account, installationId: inst(c), authMethod: "helper" });
  const env = (c: SeedChar, reports: MatchReport[]) => ({
    schema: "wf.sync-envelope.v2" as const, installationId: inst(c),
    build: "69913", addonVersion: "0.1.0", exportedAtMs: base, reports,
  });
  const mkReport = (c: MatchContract, origin: SeedChar, t: number,
    winners: SeedChar[], nonce: string): MatchReport => ({
    schema: "wf.match-report.v2", sessionId: c.sessionId,
    contractHash: hashCanonical(c as never),
    originCharacterId: origin.id, installationId: inst(origin),
    nonce, build: "69913", addonVersion: "0.1.0", detectorCatalogVersion: "cat-0",
    proposedAtMs: t, acceptedAtMs: t + 60_000,
    startedAtMs: t + 90_000, finishedAtMs: t + 900_000,
    games: winners.map((w, gi) => ({
      index: gi, observedStartMs: t + 90_000 + gi * 240_000,
      observedEndMs: t + 90_000 + (gi + 1) * 240_000,
      claimedWinnerCharacterId: w.id, finishReason: "death" as const,
      facts: [], interferenceCandidates: [], violationCandidates: [],
    })),
    coverage: [], attestations: [], peerDigests: [],
  });

  const plan = seedPlan();
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i]!;
    const a = SEED_CHARS[s.a]!, b = SEED_CHARS[s.b]!;
    const t = base + s.dayOff * DAY + i * 60_000;
    const c: MatchContract = {
      schema: "wf.match-contract.v2", sessionId: U(1000 + i), seasonId: SEASON,
      poolId: U(2), ladder: s.ladder, ratedIntent: true, bestOf: 3,
      rulesetVersionId: U(3),
      participants: [{ characterId: a.id, side: 1 }, { characterId: b.id, side: 2 }],
      levelMin: 60, levelMax: 60,
      venue: { kind: "anywhere", mapId: null, areaId: null },
      tournamentMatchId: null,
      createdAtMs: t, acceptByMs: t + 3600_000,
      configVersion: "beta-v2",
    };
    // outcome biased by hidden skill — deterministic under the fixed seed
    const pA = a.skill ** 6 / (a.skill ** 6 + b.skill ** 6);
    const w = rnd() < pA ? a : b;
    const l = w === a ? b : a;
    const winnersA = rnd() < 0.4 ? [w, l, w] : [w, w];
    const contracts = new Map([[c.sessionId, c]]);
    await ingestEnvelope(store, auth(a), {
      envelope: env(a, [mkReport(c, a, t, winnersA, `s${i}a`)]), contracts,
      nowMs: t,
    });
    if (s.mode === "solo") continue;
    // the peer agrees — except disputed series, where their claim differs
    const winnersB = s.mode === "dispute"
      ? winnersA.map((x, gi) => (gi === winnersA.length - 1 ? l : x)).concat(l).slice(0, 3)
      : winnersA;
    await ingestEnvelope(store, auth(b), {
      envelope: env(b, [mkReport(c, b, t, winnersB, `s${i}b`)]),
      nowMs: t + 1000,
    });
  }
}

const adminAccounts = (env: NodeJS.ProcessEnv = process.env): Set<string> =>
  new Set((env.ACL_ADMIN_ACCOUNTS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean));

/** Identity scope self-registered characters land in (docs/26) — one
 *  deployment serves exactly one product/environment/region/realm. */
const identityScope = (env: NodeJS.ProcessEnv = process.env) => ({
  product: env.ACL_PRODUCT ?? "wow-forever",
  environment: env.ACL_ENVIRONMENT ?? "beta",
  region: env.ACL_REGION ?? "eu",
  realmId: env.ACL_REALM ?? "forever",
});

const verifyUrlBase = () =>
  process.env.ACL_VERIFY_URL ?? "http://localhost:5173/account/pair";

/** Postgres deps — production wiring (supabase/migrations); never seeded. */
export function createPgDeps(pool: pg.Pool): ApiDeps {
  const store = new PgStore(pool);
  return {
    store,
    reads: new PgReadModel(pool),
    auth: new PgAuthStore(pool),
    events: new PgEventBoard(pool),
    world: new PgWorldBoard(pool),
    snapshots: new PgSnapshotSource(pool),
    configVersion: "beta-v2",
    verifyUrlBase: verifyUrlBase(),
    seasonId: SEASON,
    identityScope: identityScope(),
    generations: new GenerationRunner(store),
    adminAccounts: adminAccounts(),
    limiter: new RateLimiter(),
  };
}

export async function createDeps(): Promise<ApiDeps> {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase pooler requires TLS; PGSSL=disable for a local database
      ssl: process.env.PGSSL === "disable" ? undefined : { rejectUnauthorized: false },
    });
    const deps = createPgDeps(pool);
    if (!process.env[PgAuthStore.ENV.url] || !process.env[PgAuthStore.ENV.anonKey]) {
      console.warn(
        `acl api: ${PgAuthStore.ENV.url}/${PgAuthStore.ENV.anonKey} unset — ` +
        `Supabase session validation is off; sign-in, pairing approval, ` +
        `event signup and admin routes will return 401`);
    }
    try {
      // keeps /v1/status honest right after a redeploy
      await deps.generations!.runNow(SEASON);
    } catch (e) {
      console.error("initial rating generation failed:", e);
    }
    return deps;
  }
  // one shared name map: the store checks it on registration, the read
  // model + event board resolve display names from it, seedDev fills it
  const names = new Map<string, string>();
  const store = new InMemoryStore(names);
  const reads = new InMemoryReadModel(store, names);
  const events = new InMemoryEventBoard(store, names);
  const world = new InMemoryWorldBoard();
  const generations = new GenerationRunner(store);
  if (process.env.ACL_SEED !== "0") {
    await seedDev(store, reads);
    // first generation publishes before the port opens
    await generations.runNow(SEASON);
    const now = Date.now();
    events.seed({
      id: U(20), name: "Friday Fight Night", kind: "fight_night",
      whenMs: now + 2 * 86400_000, venue: "Gadgetzan courtyard",
      status: "upcoming", cap: 32, signups: 14, organizerAccountId: "acct-a",
      description: "Open challenge board all evening. Standard rules, best-of-3, walk up and fight. Identity check-ins available at the desk.",
      staff: [
        { name: "Mangler", role: "organizer", playerId: U(5), wowClass: "warrior" },
        { name: "Sneakthief", role: "referee", playerId: U(6), wowClass: "rogue" },
        { name: "Frostbolt", role: "referee", playerId: U(7), wowClass: "mage" },
      ],
    });
    events.seed({
      id: U(21), name: "Rookie Night", kind: "rookie_night",
      whenMs: now + 5 * 86400_000, venue: "Durotar — outside Orgrimmar",
      status: "upcoming", cap: 24, signups: 9,
      description: "New to dueling? Volunteers run coached practice duels. No rating pressure — just learn.",
      staff: [{ name: "Mangler", role: "organizer", playerId: U(5), wowClass: "warrior" }],
    });
    events.seed({
      id: U(22), name: "Mirror Cup — Mages", kind: "mirror_cup",
      whenMs: now + 9 * 86400_000, venue: "Steamwheedle arena",
      status: "upcoming", cap: 16, signups: 6, organizerAccountId: "acct-c",
      description: "Same-class bracket. Mirror ladder points on the line.",
      staff: [
        { name: "Frostbolt", role: "organizer", playerId: U(7), wowClass: "mage" },
        { name: "Sneakthief", role: "referee", playerId: U(6), wowClass: "rogue" },
      ],
    });
    // opt-in war journal — scoring gated on probes, so the board is
    // honest: journal data exists, points are pilot numbers
    world.seed("war", [
      { playerId: U(5), name: "Mangler", wowClass: "warrior", points: 34, reports: 11 },
      { playerId: U(6), name: "Sneakthief", wowClass: "rogue", points: 27, reports: 9 },
      { playerId: U(7), name: "Frostbolt", wowClass: "mage", points: 19, reports: 6 },
      { playerId: U(8), name: "Holydin", wowClass: "paladin", points: 15, reports: 5 },
      { playerId: U(10), name: "Moonfire", wowClass: "druid", points: 11, reports: 4 },
    ]);
    world.seed("pit", [
      { playerId: U(6), name: "Sneakthief", wowClass: "rogue", points: 12, reports: 4 },
      { playerId: U(9), name: "Shadowmend", wowClass: "priest", points: 9, reports: 3 },
      { playerId: U(5), name: "Mangler", wowClass: "warrior", points: 7, reports: 3 },
    ]);
  }
  return {
    store, reads, auth: new InMemoryAuthStore(), events, world,
    snapshots: new InMemorySnapshotSource(store, reads),
    configVersion: "beta-v2",
    verifyUrlBase: verifyUrlBase(),
    seasonId: SEASON,
    identityScope: identityScope(),
    generations,
    adminAccounts: adminAccounts(),
    limiter: new RateLimiter(),
  };
}

const MAX_BODY = 1024 * 1024; // 1 MiB
class BodyTooLarge extends Error {}

/** Reads at most 1 MiB; aborts without buffering once the cap is exceeded. */
async function readBody(r: IncomingMessage): Promise<string> {
  const declared = Number(r.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) throw new BodyTooLarge();
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        r.pause();
        r.off("data", onData);
        r.off("end", onEnd);
        r.off("error", onErr);
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(c);
    };
    const onEnd = () => resolve(Buffer.concat(chunks).toString("utf8"));
    const onErr = (e: Error) => reject(e);
    r.on("data", onData);
    r.on("end", onEnd);
    r.on("error", onErr);
  });
}

/** Public community reads — safe for a short shared cache. */
const PUBLIC_GET =
  /^\/v1\/(leaderboard|matches|world|status|rulesets|events|match\/[0-9a-fA-F-]+|player\/[0-9a-fA-F-]+)$/;

const clientIp = (req: IncomingMessage, trustProxy: boolean): string => {
  if (trustProxy) {
    const fwd = req.headers["x-forwarded-for"];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
};

export async function startServer(port = PORT) {
  const deps = await createDeps();
  const mode = process.env.DATABASE_URL ? "postgres" : "memory";
  const webOrigins = (process.env.ACL_WEB_ORIGIN ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const trustProxy = process.env.ACL_TRUST_PROXY === "1";
  const srv = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (webOrigins.length === 0) {
      res.setHeader("access-control-allow-origin", "*");
    } else {
      res.setHeader("vary", "Origin");
      if (origin && webOrigins.includes(origin)) {
        res.setHeader("access-control-allow-origin", origin);
      }
    }
    res.setHeader("access-control-allow-headers", "content-type, authorization");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("x-content-type-options", "nosniff");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url ?? "/", "http://x");
    const authed = typeof req.headers.authorization === "string";
    const publicGet = req.method === "GET" && !authed && PUBLIC_GET.test(url.pathname);
    const send = (status: number, payload: unknown,
      extra?: Record<string, string>) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": publicGet ? "public, max-age=30" : "no-store",
        ...(extra ?? {}),
      });
      res.end(JSON.stringify(payload));
    };
    let text: string;
    try {
      text = await readBody(req);
    } catch (e) {
      if (e instanceof BodyTooLarge) {
        send(413, { error: "payload too large" }, { connection: "close" });
      } else {
        send(400, { error: "bad request" }, { connection: "close" });
      }
      return;
    }
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        send(400, { error: "invalid json" });
        return;
      }
    }
    const apiReq: ApiRequest = {
      method: req.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers as Record<string, string>,
      ip: clientIp(req, trustProxy),
      ...(body !== undefined ? { body } : {}),
    };
    const out = await handleRequest(deps, apiReq);
    send(out.status, out.body, out.headers);
  });
  await new Promise<void>((r) => srv.listen(port, () => {
    console.log(`acl api :${port} mode=${mode}`);
    r();
  }));
  return srv;
}

if (process.argv[1] && /serve\.(ts|js)$/.test(process.argv[1])) {
  void startServer();
}
