import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore } from "../src/memory.js";
import { InMemoryReadModel, InMemorySnapshotSource } from "../src/reads.js";
import {
  InMemoryAuthStore, InMemoryEventBoard, InMemoryWorldBoard, handleRequest,
  type ApiDeps, type ApiRequest,
} from "../src/api.js";
import type { MatchContract, MatchReport } from "@acl/contracts";
import { hashCanonical, encodeExport, decodeUpdate } from "@acl/contracts";
import { buildGeneration } from "../src/replay.js";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEASON = U(90);
const INST_A = U(50), INST_B = U(51);

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, query: Record<string, string> = {}): ApiRequest {
  return { method, path, body, headers, query, ip: "127.0.0.1" };
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

const SCOPE = {
  product: "wow-forever", environment: "live", region: "global", realmId: "forever",
};

function makeDeps(): ApiDeps & { store: InMemoryStore; reads: InMemoryReadModel } {
  // shared name map — same wiring as serve.ts so createCharacter's
  // community-wide name check sees the seeded characters
  const names = new Map<string, string>();
  const store = new InMemoryStore(names);
  const reads = new InMemoryReadModel(store, names);
  for (const [id, accountId, name, classId, tier] of [
    [U(5), "acct-a", "Mangler", 1, "witnessed"],
    [U(6), "acct-b", "Sneakthief", 4, "witnessed"],
    [U(7), "acct-c", "Frostbolt", 7, "witnessed"],
  ] as const) {
    store.characters.set(id, { id, accountId, classId, level: 60, verificationTier: tier });
    names.set(id, name);
  }
  const events = new InMemoryEventBoard(store, names);
  events.seed({
    id: U(20), name: "Friday Fight Night", kind: "fight_night",
    whenMs: Date.now() + 86400_000, venue: "Gadgetzan", status: "upcoming",
    cap: 2, signups: 0, description: "test event", organizerAccountId: "acct-a",
    staff: [
      { name: "Mangler", role: "organizer", playerId: U(5), wowClass: "warrior" },
      { name: "Rose", role: "referee" },
    ],
  });
  const world = new InMemoryWorldBoard();
  world.seed("war", [
    { playerId: U(5), name: "Mangler", wowClass: "warrior", points: 34, reports: 11 },
  ]);
  return {
    store, reads, auth: new InMemoryAuthStore(), events, world,
    snapshots: new InMemorySnapshotSource(store, reads),
    configVersion: "beta-v2", verifyUrlBase: "http://test/pair", seasonId: SEASON,
    identityScope: { ...SCOPE },
  };
}

function contract(): MatchContract {
  return {
    schema: "wf.match-contract.v2", sessionId: U(1), seasonId: SEASON,
    poolId: U(2), ladder: "open", ratedIntent: true, bestOf: 3,
    rulesetVersionId: U(3),
    participants: [{ characterId: U(5), side: 1 }, { characterId: U(6), side: 2 }],
    levelMin: 60, levelMax: 60,
    venue: { kind: "anywhere", mapId: null, areaId: null },
    tournamentMatchId: null,
    createdAtMs: 1000, acceptByMs: 2000, configVersion: "beta-v2",
  };
}

function report(c: MatchContract, origin: string, winner: string, nonce: string, inst: string): MatchReport {
  return {
    schema: "wf.match-report.v2", sessionId: c.sessionId,
    contractHash: hashCanonical(c as never),
    originCharacterId: origin, installationId: inst, nonce,
    build: "69913", addonVersion: "0.1.0", detectorCatalogVersion: "cat-0",
    proposedAtMs: 1000, acceptedAtMs: 1100, startedAtMs: 1200, finishedAtMs: 1300,
    games: [
      { index: 0, observedStartMs: null, observedEndMs: null, claimedWinnerCharacterId: winner, finishReason: "death", facts: [], interferenceCandidates: [], violationCandidates: [] },
      { index: 1, observedStartMs: null, observedEndMs: null, claimedWinnerCharacterId: winner, finishReason: "death", facts: [], interferenceCandidates: [], violationCandidates: [] },
    ],
    coverage: [], attestations: [], peerDigests: [],
  };
}

async function pairDevice(deps: ApiDeps, inst: string, accountId: string): Promise<string> {
  const start = await handleRequest(deps, req("POST", "/v1/pair/start", { installationId: inst }));
  const { deviceCode, userCode } = start.body as { deviceCode: string; userCode: string };
  // approve requires a session — dev login first
  const sess = await handleRequest(deps, req("POST", "/v1/session", { accountId }));
  const { token: sessionToken } = sess.body as { token: string };
  const ok = await handleRequest(deps, req("POST", "/v1/pair/approve", { userCode }, bearer(sessionToken)));
  expect(ok.status).toBe(200);
  const poll = await handleRequest(deps, req("POST", "/v1/pair/poll", { deviceCode }));
  return (poll.body as { token: string }).token;
}

describe("api: pairing", () => {
  it("device flow: start -> approve (session) -> poll -> token", async () => {
    const deps = makeDeps();
    const token = await pairDevice(deps, INST_A, "acct-a");
    expect(token).toMatch(/^acld_/);
    const dev = await deps.auth.getDevice(token);
    expect(dev?.accountId).toBe("acct-a");
    expect(dev?.revoked).toBe(false);
  });

  it("approve is rejected without a session", async () => {
    const deps = makeDeps();
    const start = await handleRequest(deps, req("POST", "/v1/pair/start", { installationId: INST_A }));
    const { userCode } = start.body as { userCode: string };
    const res = await handleRequest(deps, req("POST", "/v1/pair/approve", { userCode }));
    expect(res.status).toBe(401);
  });

  it("revoked token can no longer upload", async () => {
    const deps = makeDeps();
    const token = await pairDevice(deps, INST_A, "acct-a");
    await handleRequest(deps, req("POST", "/v1/pair/revoke", {}, bearer(token)));
    const up = await handleRequest(deps, req("POST", "/v1/reports/batch", { reports: [] }, bearer(token)));
    expect(up.status).toBe(401);
  });
});

describe("api: report batch", () => {
  it("two sides upload -> corroborated -> generation -> leaderboard", async () => {
    const deps = makeDeps();
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const tokB = await pairDevice(deps, INST_B, "acct-b");
    const c = contract();
    const cDoc = c as never;

    const r1 = await handleRequest(deps, req("POST", "/v1/reports/batch", {
      reports: [report(c, U(5), U(5), "n1", INST_A)], contracts: [cDoc],
    }, bearer(tokA)));
    expect(r1.status).toBe(200);
    expect((r1.body as { accepted: number }).accepted).toBe(1);
    expect((r1.body as { receipts: { status: string }[] }).receipts[0]!.status).toBe("awaiting_peer");

    const r2 = await handleRequest(deps, req("POST", "/v1/reports/batch", {
      reports: [report(c, U(6), U(5), "n1", INST_B)],
    }, bearer(tokB)));
    expect((r2.body as { receipts: { status: string }[] }).receipts[0]!.status).toBe("rating_pending");

    const gen = await buildGeneration(deps.store, SEASON, "gen-api-1");
    expect(gen.status).toBe("published");

    const board = await handleRequest(deps, req("GET", "/v1/leaderboard", {}, {}, { ladder: "open" }));
    const entries = (board.body as {
      entries: { name: string; rating: number; placement: { seriesDone: number } | null }[];
    }).entries;
    expect(entries).toHaveLength(2);
    // one series each: still placing — progress shown, no number yet
    expect(entries[0]!.name).toBe("Mangler"); // winner ordered first internally
    expect(entries[0]!.placement?.seriesDone).toBe(1);
  });

  it("dedupe: identical resubmit counts as alreadyReceived", async () => {
    const deps = makeDeps();
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const c = contract();
    const rep = report(c, U(5), U(5), "n1", INST_A);
    await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [rep], contracts: [c as never] }, bearer(tokA)));
    const again = await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [rep] }, bearer(tokA)));
    const body = again.body as { alreadyReceived: number; accepted: number };
    expect(body.alreadyReceived).toBe(1);
    expect(body.accepted).toBe(0);
  });

  it("accepts raw WFP2 envelope strings (manual import path)", async () => {
    const deps = makeDeps();
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const c = contract();
    const env = encodeExport({
      schema: "wf.sync-envelope.v2", installationId: INST_A, build: "69913",
      addonVersion: "0.1.0", exportedAtMs: Date.now(),
      reports: [report(c, U(5), U(5), "n1", INST_A)],
    } as never);
    const res = await handleRequest(deps, req("POST", "/v1/reports/batch",
      { envelopes: [env], contracts: [c as never] }, bearer(tokA)));
    expect((res.body as { accepted: number }).accepted).toBe(1);
  });

  it("unauthenticated upload is rejected", async () => {
    const deps = makeDeps();
    const res = await handleRequest(deps, req("POST", "/v1/reports/batch", { reports: [] }));
    expect(res.status).toBe(401);
  });
});

describe("api: reads", () => {
  it("match detail renders the reconciled record", async () => {
    const deps = makeDeps();
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const c = contract();
    await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [report(c, U(5), U(5), "n1", INST_A)], contracts: [c as never] }, bearer(tokA)));
    const res = await handleRequest(deps, req("GET", `/v1/match/${U(1)}`));
    expect(res.status).toBe(200);
    const m = res.body as { status: string; reportsReceived: number };
    expect(m.reportsReceived).toBe(1);
    expect(m.status).toBe("awaiting_opponent");
  });

  it("matches index lists the reconciled record newest-first", async () => {
    const deps = makeDeps();
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const tokB = await pairDevice(deps, INST_B, "acct-b");
    const c = contract();
    await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [report(c, U(5), U(5), "n1", INST_A)], contracts: [c as never] }, bearer(tokA)));
    await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [report(c, U(6), U(5), "n1", INST_B)] }, bearer(tokB)));

    const res = await handleRequest(deps, req("GET", "/v1/matches"));
    expect(res.status).toBe(200);
    const list = (res.body as { matches: {
      id: string; status: string; evidence: string; reportsReceived: number;
      a: { name: string }; b: { name: string }; scoreA: number; scoreB: number;
      winnerId: string | null;
    }[] }).matches;
    expect(list).toHaveLength(1);
    const m = list[0]!;
    expect(m.id).toBe(U(1));
    expect(m.a.name).toBe("Mangler");
    expect(m.b.name).toBe("Sneakthief");
    expect(m.scoreA).toBe(2);
    expect(m.winnerId).toBe(U(5));
    expect(m.evidence).toBe("corroborated");
    expect(m.reportsReceived).toBe(2);
    expect(m.status).toBe("rated"); // corroborated + rating pending/applied
  });

  it("matches index honours the limit cap", async () => {
    const deps = makeDeps();
    const res = await handleRequest(deps,
      req("GET", "/v1/matches", {}, {}, { limit: "99999" }));
    expect(res.status).toBe(200); // clamped, not an error
  });

  it("player detail carries ratings + match history", async () => {
    const deps = makeDeps();
    const tokA = await pairDevice(deps, INST_A, "acct-a");
    const tokB = await pairDevice(deps, INST_B, "acct-b");
    const c = contract();
    await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [report(c, U(5), U(5), "n1", INST_A)], contracts: [c as never] }, bearer(tokA)));
    await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [report(c, U(6), U(5), "n1", INST_B)] }, bearer(tokB)));
    await buildGeneration(deps.store, SEASON, "gen-p1");

    const res = await handleRequest(deps, req("GET", `/v1/player/${U(5)}`));
    expect(res.status).toBe(200);
    const p = res.body as {
      name: string; wowClass: string;
      open: { rating: number | null; wins: number; losses: number;
        placement: { seriesDone: number } | null };
      matches: { id: string; winnerId: string | null }[];
      rivals: { playerId: string; name: string; wins: number; losses: number;
        meetings: number; lastPlayedMs: number }[];
      lastActiveAtMs: number;
    };
    expect(p.name).toBe("Mangler");
    expect(p.matches.map((m) => m.id)).toContain(U(1));
    expect(p.matches[0]!.winnerId).toBe(U(5));
    // 1 series → still placing; honest progress, not a fake number
    expect(p.open.rating).toBeNull();
    expect(p.open.placement?.seriesDone).toBe(1);
    expect(p.open.wins).toBe(1);
    expect(p.lastActiveAtMs).toBeGreaterThan(0);
    // rivalry card: 1 decided win over Sneakthief
    expect(p.rivals).toHaveLength(1);
    expect(p.rivals[0]).toMatchObject({
      playerId: U(6), name: "Sneakthief", wins: 1, losses: 0, meetings: 1,
    });
  });

  it("events list + signup: session, character resolution, duplicate, cap", async () => {
    const deps = makeDeps();
    const list = await handleRequest(deps, req("GET", "/v1/events"));
    expect(list.status).toBe(200);
    const events = (list.body as { events: { id: string; signups: number;
      staff?: { name: string; role: string }[] }[] }).events;
    expect(events).toHaveLength(1);
    expect(events[0]!.signups).toBe(0);
    // event staff serialize — character names + link/class when on record;
    // organizer-designated staff are the only scope in which "witness"
    // identity check-ins exist
    expect(events[0]!.staff).toEqual([
      { name: "Mangler", role: "organizer", playerId: U(5), wowClass: "warrior" },
      { name: "Rose", role: "referee" },
    ]);

    // unauthenticated signup rejected
    const noAuth = await handleRequest(deps, req("POST", `/v1/events/${U(20)}/signup`, {}));
    expect(noAuth.status).toBe(401);

    const sess = async (accountId: string) =>
      (await handleRequest(deps, req("POST", "/v1/session", { accountId })))
        .body as { token: string };

    // acct-a signs up — server picks their character (Mangler, U(5))
    const s1 = await sess("acct-a");
    const ok = await handleRequest(deps, req("POST", `/v1/events/${U(20)}/signup`, {}, bearer(s1.token)));
    expect(ok.status).toBe(200);
    expect((ok.body as { status: string }).status).toBe("ok");

    // duplicate is idempotent, not an error
    const dup = await handleRequest(deps, req("POST", `/v1/events/${U(20)}/signup`, {}, bearer(s1.token)));
    expect(dup.status).toBe(200);
    expect((dup.body as { status: string }).status).toBe("duplicate");

    // acct-b fills the last seat (cap 2); a third account hits the cap —
    // the full check runs before character resolution
    const s2 = await sess("acct-b");
    const ok2 = await handleRequest(deps, req("POST", `/v1/events/${U(20)}/signup`, {}, bearer(s2.token)));
    expect((ok2.body as { status: string }).status).toBe("ok");
    const s3 = await sess("acct-c");
    const full = await handleRequest(deps, req("POST", `/v1/events/${U(20)}/signup`, {}, bearer(s3.token)));
    expect(full.status).toBe(409);

    // list reflects the two signups and marks registered for acct-a
    const after = await handleRequest(deps, req("GET", "/v1/events", {}, bearer(s1.token)));
    const e = (after.body as { events: { signups: number; registered: boolean }[] }).events[0]!;
    expect(e.signups).toBe(2);
    expect(e.registered).toBe(true);
  });

  it("event create: session required, creator becomes organizer+staff", async () => {
    const deps = makeDeps();
    // unauthenticated create rejected
    const noAuth = await handleRequest(deps, req("POST", "/v1/events",
      { name: "X", kind: "fight_night", whenMs: 1, cap: 8 }));
    expect(noAuth.status).toBe(401);

    const sess = async (accountId: string) =>
      (await handleRequest(deps, req("POST", "/v1/session", { accountId })))
        .body as { token: string };
    const s = await sess("acct-c");
    const created = await handleRequest(deps, req("POST", "/v1/events", {
      name: "Duskwood Duels", kind: "fight_night",
      whenMs: Date.now() + 86400_000, venue: "Darkshire", cap: 8,
      description: "test",
    }, bearer(s.token)));
    expect(created.status).toBe(201);
    const ev = (created.body as { event: { id: string; organizerAccountId: string } }).event;
    expect(ev.organizerAccountId).toBe("acct-c");

    // creator shows as organizer staff, marked managedByMe for them only
    const list = await handleRequest(deps, req("GET", "/v1/events", {}, bearer(s.token)));
    const mine = (list.body as { events: { id: string; managedByMe: boolean;
      staff?: { name: string; role: string }[] }[] }).events.find((e) => e.id === ev.id)!;
    expect(mine.managedByMe).toBe(true);
    expect(mine.staff).toEqual([{ name: "Frostbolt", role: "organizer",
      playerId: U(7), wowClass: "mage" }]);
    const anon = await handleRequest(deps, req("GET", "/v1/events"));
    expect((anon.body as { events: { managedByMe?: boolean }[] }).events[0]!.managedByMe)
      .toBeUndefined();
  });

  it("event staff: only the organizer designates, target needs a character", async () => {
    const deps = makeDeps();
    const sess = async (accountId: string) =>
      (await handleRequest(deps, req("POST", "/v1/session", { accountId })))
        .body as { token: string };
    const org = await sess("acct-a");   // U(20) organizer
    const other = await sess("acct-b");

    // non-organizer cannot designate
    const denied = await handleRequest(deps,
      req("POST", `/v1/events/${U(20)}/staff`, { accountId: "acct-c" }, bearer(other.token)));
    expect(denied.status).toBe(403);

    // organizer designates acct-c (Frostbolt) as referee
    const ok = await handleRequest(deps,
      req("POST", `/v1/events/${U(20)}/staff`, { accountId: "acct-c" }, bearer(org.token)));
    expect(ok.status).toBe(200);

    // unknown account fails cleanly
    const bad = await handleRequest(deps,
      req("POST", `/v1/events/${U(20)}/staff`, { accountId: "acct-ghost" }, bearer(org.token)));
    expect(bad.status).toBe(422);

    const list = await handleRequest(deps, req("GET", "/v1/events"));
    const e = (list.body as { events: { staff?: { name: string; role: string }[] }[] })
      .events[0]!;
    expect(e.staff).toContainEqual({ name: "Frostbolt", role: "referee",
      playerId: U(7), wowClass: "mage" });
  });

  it("world board: war/pit entries, scoring gate is honest", async () => {
    const deps = makeDeps();
    const res = await handleRequest(deps, req("GET", "/v1/world"));
    expect(res.status).toBe(200);
    const b = res.body as { war: { name: string; points: number }[];
      pit: unknown[]; scoringLive: boolean };
    expect(b.war[0]).toMatchObject({ name: "Mangler", points: 34 });
    expect(b.pit).toHaveLength(0);
    expect(b.scoringLive).toBe(false); // journal-only until probes pass
  });

  it("rulesets: published versions, newest per ruleset, standard first", async () => {
    const deps = makeDeps();
    deps.reads.seedRuleset({
      rulesetId: U(30), versionId: U(3), version: 1,
      name: "Ranked Standard", description: "core rules",
      standard: true,
      rules: [{ ruleId: "std.consumables", category: "consumable",
        action: "deny", phase: "active", sanction: "game_loss" }],
    });
    deps.reads.seedRuleset({
      rulesetId: U(31), versionId: U(32), version: 1,
      name: "Community Classic", description: "casual",
      standard: false, rules: [],
    });
    // an older version of the community set — must not shadow v2
    deps.reads.seedRuleset({
      rulesetId: U(31), versionId: U(33), version: 2,
      name: "Community Classic", description: "casual v2",
      standard: false, rules: [],
    });
    const res = await handleRequest(deps, req("GET", "/v1/rulesets"));
    expect(res.status).toBe(200);
    const list = (res.body as { rulesets: {
      versionId: string; name: string; standard: boolean; version: number }[] }).rulesets;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: "Ranked Standard", standard: true, versionId: U(3) });
    expect(list[1]).toMatchObject({ versionId: U(33), version: 2, standard: false });
  });

  it("addon-update: helper-auth bundle with receipts + rulesets", async () => {
    const deps = makeDeps();
    deps.reads.seedRuleset({
      rulesetId: U(30), versionId: U(3), version: 1,
      name: "Ranked Standard", description: "core", standard: true, rules: [],
    });
    // unauthenticated is rejected
    const noAuth = await handleRequest(deps, req("GET", "/v1/addon-update"));
    expect(noAuth.status).toBe(401);

    // upload a report first so the bundle carries a real receipt
    const token = await pairDevice(deps, INST_A, "acct-a");
    const c = contract();
    const hash = hashCanonical(c as never);
    await deps.store.insertContractWithMatch(
      { id: c.sessionId, contractHash: hash, canonical: c, seasonId: SEASON,
        poolId: U(2), rulesetVersionId: U(3), ratedIntent: true,
        ladder: "open", bestOf: 3, levelMin: 60, levelMax: 60 },
      [
        { matchId: c.sessionId, characterId: U(5), accountIdAtMatch: "acct-a", side: 1 },
        { matchId: c.sessionId, characterId: U(6), accountIdAtMatch: "acct-b", side: 2 },
      ]);
    await handleRequest(deps, req("POST", "/v1/reports/batch",
      { reports: [report(c, U(5), U(5), "n-rs", INST_A)], contracts: [] }, bearer(token)));

    const res = await handleRequest(deps, req("GET", "/v1/addon-update", {}, bearer(token)));
    expect(res.status).toBe(200);
    const body = res.body as { update: string; snapshotSequence: number };
    expect(body.update).toMatch(/^WFU1:/);
    expect(body.snapshotSequence).toBe(1);
    const bundle = decodeUpdate(body.update) as {
      accountId: string; receipts: { nonce: string; status: string }[];
      rulesets: { name: string; standard: boolean }[];
    };
    expect(bundle.accountId).toBe("acct-a");
    expect(bundle.receipts.map((r) => r.nonce)).toContain("n-rs");
    expect(bundle.rulesets[0]).toMatchObject({ name: "Ranked Standard", standard: true });

    // a second fetch bumps the sequence (monotonic per account)
    const res2 = await handleRequest(deps, req("GET", "/v1/addon-update", {}, bearer(token)));
    expect((res2.body as { snapshotSequence: number }).snapshotSequence).toBe(2);
  });
});

describe("api: character registration", () => {
  const session = async (deps: ApiDeps, accountId: string) =>
    (await handleRequest(deps, req("POST", "/v1/session", { accountId })))
      .body as { token: string };
  const register = (deps: ApiDeps, token: string, body: unknown) =>
    handleRequest(deps, req("POST", "/v1/characters", body, bearer(token)));

  it("requires a session — unauthenticated gets 401", async () => {
    const deps = makeDeps();
    const res = await register(deps, "bogus", { name: "Testadin" });
    expect(res.status).toBe(401);
    const noTok = await handleRequest(deps, req("POST", "/v1/characters",
      { name: "Testadin", classId: 2, factionId: 0, level: 60 }));
    expect(noTok.status).toBe(401);
  });

  it("registers at claimed tier — 201 with the echoed character", async () => {
    const deps = makeDeps();
    const s = await session(deps, "acct-a");
    const res = await register(deps, s.token,
      { name: "Testadin", classId: 2, factionId: 0, level: 60 });
    expect(res.status).toBe(201);
    const c = (res.body as { character: {
      id: string; name: string; classId: number; factionId: number;
      level: number; verificationTier: string;
    } }).character;
    expect(c).toMatchObject({
      name: "Testadin", classId: 2, factionId: 0, level: 60,
      verificationTier: "claimed",
    });
    // the row is real: /v1/me lists it for the account
    const me = await handleRequest(deps, req("GET", "/v1/me", {}, bearer(s.token)));
    const chars = (me.body as { characters: { id: string; name: string }[] }).characters;
    expect(chars.map((x) => x.id)).toContain(c.id);
  });

  it("rejects a duplicate name — same account and different account", async () => {
    const deps = makeDeps();
    const s1 = await session(deps, "acct-a");
    const s2 = await session(deps, "acct-b");
    const body = { name: "Duellist", classId: 4, factionId: 1, level: 60 };
    expect((await register(deps, s1.token, body)).status).toBe(201);
    // same account re-claiming
    expect((await register(deps, s1.token, body)).status).toBe(409);
    // a different account — one name per community
    expect((await register(deps, s2.token, body)).status).toBe(409);
  });

  it("name checks are case-insensitive and cover seeded characters", async () => {
    const deps = makeDeps();
    const s = await session(deps, "acct-c");
    expect((await register(deps, s.token,
      { name: "Testadin", classId: 2, factionId: 0, level: 60 })).status).toBe(201);
    expect((await register(deps, s.token,
      { name: "testadin", classId: 2, factionId: 0, level: 60 })).status).toBe(409);
    // seeded names live in the same map — "mangler" collides with Mangler
    expect((await register(deps, s.token,
      { name: "mangler", classId: 1, factionId: 0, level: 60 })).status).toBe(409);
  });

  it("validates fields — bad name/class/faction/level are 422", async () => {
    const deps = makeDeps();
    const s = await session(deps, "acct-a");
    const ok = { name: "Testadin", classId: 2, factionId: 0, level: 60 };
    const bad: [unknown, string][] = [
      [{ ...ok, name: "A" }, "invalid_name"],        // too short
      [{ ...ok, name: "Waytoolongname" }, "invalid_name"], // > 12
      [{ ...ok, name: "Bad Name!" }, "invalid_name"],      // non-alpha
      [{ ...ok, name: "" }, "invalid_name"],
      [{ ...ok, classId: 0 }, "invalid_classId"],
      [{ ...ok, classId: 10 }, "invalid_classId"],
      [{ ...ok, classId: 2.5 }, "invalid_classId"],
      [{ ...ok, factionId: 2 }, "invalid_factionId"],
      [{ ...ok, level: 0 }, "invalid_level"],
      [{ ...ok, level: 61 }, "invalid_level"],
      [{ ...ok, level: "max" }, "invalid_level"],
      [{}, "invalid_name"],
    ];
    for (const [body, error] of bad) {
      const res = await register(deps, s.token, body);
      expect(res.status).toBe(422);
      expect((res.body as { error: string }).error).toBe(error);
    }
  });

  it("a registered character can self-report — no identity_unverified", async () => {
    const deps = makeDeps();
    // fresh account, no characters: register one, then upload its own report
    const s = await session(deps, "acct-z");
    const reg = await register(deps, s.token,
      { name: "Newblade", classId: 4, factionId: 1, level: 60 });
    expect(reg.status).toBe(201);
    const charId = (reg.body as { character: { id: string } }).character.id;

    const tok = await pairDevice(deps, U(60), "acct-z");
    const c: MatchContract = {
      ...contract(), sessionId: U(77),
      participants: [
        { characterId: charId, side: 1 }, { characterId: U(6), side: 2 },
      ],
    };
    const res = await handleRequest(deps, req("POST", "/v1/reports/batch", {
      reports: [report(c, charId, charId, "n1", U(60))],
      contracts: [c as never],
    }, bearer(tok)));
    expect(res.status).toBe(200);
    const receipt = (res.body as { receipts: { status: string }[] }).receipts[0]!;
    // before registration this upload died at identity_unverified (ingest
    // rejects reports whose origin char isn't on the authed account)
    expect(receipt.status).not.toBe("rejected");
    expect(receipt.status).toBe("awaiting_peer");
  });
});

describe("api: misc", () => {
  it("unknown routes 404", async () => {
    const deps = makeDeps();
    const res = await handleRequest(deps, req("GET", "/v1/nope"));
    expect(res.status).toBe(404);
  });
});
