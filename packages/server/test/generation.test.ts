import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/memory.js";
import { InMemoryReadModel, InMemorySnapshotSource } from "../src/reads.js";
import {
  InMemoryAuthStore, InMemoryEventBoard, InMemoryWorldBoard, handleRequest,
  type ApiDeps, type ApiRequest,
} from "../src/api.js";
import { GenerationRunner } from "../src/generation.js";
import { seedDev, SEASON } from "../src/serve.js";
import type { MatchContract, MatchReport } from "@acl/contracts";
import { hashCanonical } from "@acl/contracts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T_SEASON = U(90);
const INST_A = U(50), INST_B = U(51);

function req(method: string, path: string, body?: unknown,
  headers: Record<string, string> = {}, query: Record<string, string> = {}): ApiRequest {
  return { method, path, body, headers, query, ip: "127.0.0.1" };
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

function makeDeps(): ApiDeps & { store: InMemoryStore; reads: InMemoryReadModel } {
  const names = new Map<string, string>();
  const store = new InMemoryStore(names);
  const reads = new InMemoryReadModel(store, names);
  for (const [id, accountId, name, classId, tier] of [
    [U(5), "acct-a", "Mangler Doomhowl", 1, "witnessed"],
    [U(6), "acct-b", "Sneakthief Shadowvale", 4, "witnessed"],
    [U(7), "acct-c", "Frostbolt Winterveil", 7, "witnessed"],
  ] as const) {
    store.characters.set(id, { id, accountId, classId, level: 60, verificationTier: tier });
    names.set(id, name);
  }
  return {
    store, reads, auth: new InMemoryAuthStore(),
    events: new InMemoryEventBoard(store, names),
    world: new InMemoryWorldBoard(),
    snapshots: new InMemorySnapshotSource(store, reads),
    configVersion: "beta-v2", verifyUrlBase: "http://test/pair", seasonId: T_SEASON,
    identityScope: {
      product: "wow-forever", environment: "beta", region: "eu",
      realmId: "forever",
    },
  };
}

function contract(sessionId: string): MatchContract {
  return {
    schema: "wf.match-contract.v2", sessionId, seasonId: T_SEASON,
    poolId: U(2), ladder: "open", ratedIntent: true, bestOf: 3,
    rulesetVersionId: U(3),
    participants: [{ characterId: U(5), side: 1 }, { characterId: U(6), side: 2 }],
    levelMin: 60, levelMax: 60,
    venue: { kind: "anywhere", mapId: null, areaId: null },
    tournamentMatchId: null,
    createdAtMs: 1000, acceptByMs: 2000, configVersion: "beta-v2",
  };
}

function report(c: MatchContract, origin: string, winner: string,
  nonce: string, inst: string): MatchReport {
  return {
    schema: "wf.match-report.v2", sessionId: c.sessionId,
    contractHash: hashCanonical(c as never),
    originCharacterId: origin, installationId: inst, nonce,
    build: "69913", addonVersion: "0.1.0", detectorCatalogVersion: "cat-0",
    proposedAtMs: 1000, acceptedAtMs: 1100, startedAtMs: 1200, finishedAtMs: 1300,
    games: [
      { index: 0, observedStartMs: null, observedEndMs: null, claimedWinnerCharacterId: winner,
        finishReason: "death", facts: [], interferenceCandidates: [], violationCandidates: [] },
      { index: 1, observedStartMs: null, observedEndMs: null, claimedWinnerCharacterId: winner,
        finishReason: "death", facts: [], interferenceCandidates: [], violationCandidates: [] },
    ],
    coverage: [], attestations: [], peerDigests: [],
  };
}

async function pairDevice(deps: ApiDeps, inst: string, accountId: string): Promise<string> {
  const start = await handleRequest(deps, req("POST", "/v1/pair/start", { installationId: inst }));
  const { deviceCode, userCode } = start.body as { deviceCode: string; userCode: string };
  const sess = await handleRequest(deps, req("POST", "/v1/session", { accountId }));
  const { token: sessionToken } = sess.body as { token: string };
  await handleRequest(deps, req("POST", "/v1/pair/approve", { userCode }, bearer(sessionToken)));
  const poll = await handleRequest(deps, req("POST", "/v1/pair/poll", { deviceCode }));
  return (poll.body as { token: string }).token;
}

async function corroboratedSeries(deps: ApiDeps, sessionId: string,
  tokA: string, tokB: string): Promise<void> {
  const c = contract(sessionId);
  await handleRequest(deps, req("POST", "/v1/reports/batch",
    { reports: [report(c, U(5), U(5), `n-${sessionId.slice(-4)}a`, INST_A)],
      contracts: [c as never] }, bearer(tokA)));
  await handleRequest(deps, req("POST", "/v1/reports/batch",
    { reports: [report(c, U(6), U(5), `n-${sessionId.slice(-4)}b`, INST_B)] }, bearer(tokB)));
}

describe("generation runner", () => {
  it("ingest schedules a debounced generation — no manual buildGeneration", async () => {
    const deps = makeDeps();
    const runner = new GenerationRunner(deps.store, { debounceMs: 0 });
    deps.generations = runner;
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const tokB = await pairDevice(deps, INST_B, "acct-b");
    await corroboratedSeries(deps, U(100), tokA, tokB);
    await runner.pending(T_SEASON);

    const board = await handleRequest(deps,
      req("GET", "/v1/leaderboard", {}, {}, { ladder: "open" }));
    const entries = (board.body as {
      entries: { name: string; placement: unknown }[];
    }).entries;
    expect(entries).toHaveLength(2); // both still placing — one series each

    const status = await handleRequest(deps, req("GET", "/v1/status"));
    const rg = (status.body as {
      ratingGeneration: { id: string; seriesCounted: number } | null;
    }).ratingGeneration;
    expect(rg).not.toBeNull();
    expect(rg!.seriesCounted).toBeGreaterThanOrEqual(1);

    // the published generation marked the series applied
    expect((await deps.store.getMatch(U(100)))!.rating).toBe("applied");
  });

  it("a burst of ingests coalesces into exactly one build", async () => {
    const deps = makeDeps();
    let idCalls = 0;
    const runner = new GenerationRunner(deps.store, {
      debounceMs: 40, idGen: () => `gen-${++idCalls}`,
    });
    deps.generations = runner;
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const tokB = await pairDevice(deps, INST_B, "acct-b");
    await corroboratedSeries(deps, U(100), tokA, tokB);
    await corroboratedSeries(deps, U(101), tokA, tokB);
    await runner.pending(T_SEASON);
    expect(idCalls).toBe(1);
    expect(runner.latest(T_SEASON)?.events).toBe(2);
  });

  it("runNow serializes — a call during a build queues one follow-up", async () => {
    const deps = makeDeps();
    let idCalls = 0;
    const runner = new GenerationRunner(deps.store, { idGen: () => `gen-${++idCalls}` });
    await corroboratedSeries(deps, U(100), await pairDevice(deps, INST_A, "acct-a"),
      await pairDevice(deps, INST_B, "acct-b"));
    const [r1, r2] = await Promise.all([
      runner.runNow(T_SEASON), runner.runNow(T_SEASON),
    ]);
    expect(r1.status).toBe("published");
    expect(r2.status).toBe("published");
    expect(idCalls).toBeLessThanOrEqual(2); // at most one follow-up, never parallel
    await runner.pending(T_SEASON);
  });

  it("admin regenerate requires an admin session; disabled without a runner", async () => {
    const deps = makeDeps();
    deps.adminAccounts = new Set(["acct-admin"]);
    const sess = async (accountId: string) =>
      (await handleRequest(deps, req("POST", "/v1/session", { accountId })))
        .body as { token: string };
    const admin = await sess("acct-admin");
    const plain = await sess("acct-a");

    // no runner configured -> 503 even for an admin
    const off = await handleRequest(deps,
      req("POST", "/v1/admin/regenerate", {}, bearer(admin.token)));
    expect(off.status).toBe(503);

    deps.generations = new GenerationRunner(deps.store, { debounceMs: 0 });
    const denied = await handleRequest(deps, req("POST", "/v1/admin/regenerate"));
    expect(denied.status).toBe(401);
    // signed-in but not in ACL_ADMIN_ACCOUNTS -> 403
    const notAdmin = await handleRequest(deps,
      req("POST", "/v1/admin/regenerate", {}, bearer(plain.token)));
    expect(notAdmin.status).toBe(403);
    expect((notAdmin.body as { error: string }).error).toBe("admin only");
    const res = await handleRequest(deps,
      req("POST", "/v1/admin/regenerate", {}, bearer(admin.token)));
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("published");
  });

  it("an unset admin list denies everyone", async () => {
    const deps = makeDeps(); // no adminAccounts
    const sess = await handleRequest(deps, req("POST", "/v1/session", { accountId: "acct-a" }));
    const tok = (sess.body as { token: string }).token;
    const res = await handleRequest(deps,
      req("POST", "/v1/admin/regenerate", {}, bearer(tok)));
    expect(res.status).toBe(403);
  });
});

describe("seeded dev board", () => {
  async function seededBoard() {
    const store = new InMemoryStore();
    const reads = new InMemoryReadModel(store);
    await seedDev(store, reads);
    const runner = new GenerationRunner(store, { debounceMs: 0 });
    const res = await runner.runNow(SEASON);
    expect(res.status).toBe("published");
    return { store, reads };
  }

  it("six established + placing tail; Mangler leads, Dotz never rated", async () => {
    const { reads } = await seededBoard();
    const board = await reads.leaderboard(SEASON, "open");
    const rated = board.filter((e) => e.placement === null);
    const placing = board.filter((e) => e.placement !== null);
    expect(rated.length).toBeGreaterThanOrEqual(6);
    expect(placing.length).toBeGreaterThanOrEqual(2);
    expect(board[0]!.name).toBe("Mangler Doomhowl");
    expect(board.some((e) => e.name === "Dotz Gearspark")).toBe(false);
  });

  it("mirror ladder lists both druids", async () => {
    const { reads } = await seededBoard();
    const mirror = await reads.leaderboard(SEASON, "mirror");
    expect(mirror.map((e) => e.name).sort()).toEqual(["Manglepaw Fernshade", "Moonfire Starchaser"]);
    expect(mirror.every((e) => e.wowClass === "druid")).toBe(true);
  });

  it("rated rows carry real W/L that matches the player page", async () => {
    const { reads } = await seededBoard();
    const board = await reads.leaderboard(SEASON, "open");
    const top = board[0]!;
    const p = (await reads.playerDetail(top.playerId)) as {
      open: { wins: number; losses: number };
    };
    // the board and the player page count the same decided, non-disputed series
    expect(top.wins).toBe(p.open.wins);
    expect(top.losses).toBe(p.open.losses);
    for (const e of board) {
      if (e.placement === null) {
        expect(e.rating).toBeGreaterThan(0);
        expect(e.wins + e.losses).toBeGreaterThan(0);
      }
    }
  });

  it("rated entries precede placing; ranks contiguous 1..n", async () => {
    const { reads } = await seededBoard();
    const board = await reads.leaderboard(SEASON, "open");
    let seenPlacing = false;
    for (const [i, e] of board.entries()) {
      if (e.placement !== null) seenPlacing = true;
      else expect(seenPlacing).toBe(false);
      expect(e.rank).toBe(i + 1);
    }
  });
});
