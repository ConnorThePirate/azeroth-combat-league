/**
 * pg.test.ts — Postgres integration test (CI service container only).
 *
 * Runs `vitest run test/pg.test.ts` with DATABASE_URL set, after
 * supabase/migrations have been applied (see .github/workflows/ci.yml).
 * Skipped everywhere else so the unit suite never needs a database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { ApiDeps, ApiRequest } from "../src/api.js";
import { handleRequest } from "../src/api.js";
import type { MatchContract, MatchReport } from "@acl/contracts";
import { hashCanonical } from "@acl/contracts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACCT_A = U(60), ACCT_B = U(61);
const INST_A = U(50), INST_B = U(51);
const MATCH = randomUUID(); // fresh per run — the DB may persist between runs

function req(method: string, path: string, body?: unknown,
  headers: Record<string, string> = {}, query: Record<string, string> = {}): ApiRequest {
  return { method, path, body, headers, query, ip: "127.0.0.1" };
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

function contract(seasonId: string): MatchContract {
  return {
    schema: "wf.match-contract.v2", sessionId: MATCH, seasonId,
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
      { index: 0, observedStartMs: null, observedEndMs: null,
        claimedWinnerCharacterId: winner, finishReason: "death",
        facts: [], interferenceCandidates: [], violationCandidates: [] },
      { index: 1, observedStartMs: null, observedEndMs: null,
        claimedWinnerCharacterId: winner, finishReason: "death",
        facts: [], interferenceCandidates: [], violationCandidates: [] },
    ],
    coverage: [], attestations: [], peerDigests: [],
  };
}

describe.skipIf(!process.env.DATABASE_URL)("postgres wiring", () => {
  let pool: pg.Pool;
  let deps: ApiDeps;

  afterAll(async () => {
    await pool?.end();
  });

  beforeAll(async () => {
    // a fresh season per run keeps assertions independent of prior state
    process.env.ACL_SEASON = randomUUID();
    const { createPgDeps } = await import("../src/serve.js");
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "disable" ? undefined : { rejectUnauthorized: false },
    });
    deps = createPgDeps(pool);
    const season = deps.seasonId;

    // FK prerequisites + the three test characters (identical ids to the
    // unit suite so report/contract shapes match api.test.ts)
    await pool.query(`
      insert into level_brackets (id, level_min, level_max)
        values ('${U(4)}', 60, 60) on conflict do nothing;
      insert into seasons (id, name, level_bracket_id, pool_scheme, starts_at)
        values ('${season}', 'CI Season', '${U(4)}', '{}'::jsonb, now())
        on conflict do nothing;
      insert into competition_pools (id, name, scheme)
        values ('${U(2)}', 'ci pool', '{}'::jsonb) on conflict do nothing;
      insert into ruleset_versions (id, ruleset_id, version, is_standard, content, content_hash)
        values ('${U(3)}', '${U(30)}', 1, true,
          '{"name":"Ranked Standard","description":"ci","rules":[]}'::jsonb,
          'ci-hash-${season}') on conflict do nothing;
      insert into profiles (id, public_slug) values
        ('${U(70)}', 'ci-alpha'), ('${U(71)}', 'ci-bravo'), ('${U(72)}', 'ci-charlie')
        on conflict do nothing;
      insert into accounts (id, profile_id) values
        ('${ACCT_A}', '${U(70)}'), ('${ACCT_B}', '${U(71)}'), ('${U(62)}', '${U(72)}')
        on conflict do nothing;
      insert into characters
        (id, account_id, product, environment, region, realm_id,
         name, class_id, faction_id, level, verification_tier)
        values
        ('${U(5)}', '${ACCT_A}', 'wow-forever', 'beta', 'EU', 'forever',
         'Mangler', 1, 0, 60, 'provider_verified'),
        ('${U(6)}', '${ACCT_B}', 'wow-forever', 'beta', 'EU', 'forever',
         'Sneakthief', 4, 0, 60, 'witnessed'),
        ('${U(7)}', '${U(62)}', 'wow-forever', 'beta', 'EU', 'forever',
         'Frostbolt', 7, 0, 60, 'witnessed')
        on conflict do nothing;
    `);

    // device credentials via the real AuthStore path — creates the
    // installations rows match_reports.installation_id references
    await deps.auth.saveDevice({
      token: `acld_${"a".repeat(32)}`, accountId: ACCT_A,
      installationId: INST_A, issuedAtMs: Date.now(), revoked: false,
    });
    await deps.auth.saveDevice({
      token: `acld_${"b".repeat(32)}`, accountId: ACCT_B,
      installationId: INST_B, issuedAtMs: Date.now(), revoked: false,
    });
  });

  it("two sides upload -> corroborated -> generation -> leaderboard", async () => {
    const tokA = `acld_${"a".repeat(32)}`;
    const tokB = `acld_${"b".repeat(32)}`;
    const c = contract(deps.seasonId);

    const r1 = await handleRequest(deps, req("POST", "/v1/reports/batch", {
      reports: [report(c, U(5), U(5), "pg-n1", INST_A)], contracts: [c as never],
    }, bearer(tokA)));
    expect(r1.status).toBe(200);
    expect((r1.body as { receipts: { status: string }[] }).receipts[0]!.status)
      .toBe("awaiting_peer");

    const r2 = await handleRequest(deps, req("POST", "/v1/reports/batch", {
      reports: [report(c, U(6), U(5), "pg-n1", INST_B)],
    }, bearer(tokB)));
    expect(r2.status).toBe(200);
    expect((r2.body as { receipts: { status: string }[] }).receipts[0]!.status)
      .toBe("rating_pending");

    const gen = await deps.generations!.runNow(deps.seasonId);
    expect(gen.status).toBe("published");

    const board = await handleRequest(deps,
      req("GET", "/v1/leaderboard", {}, {}, { ladder: "open" }));
    const entries = (board.body as {
      entries: { playerId: string; name: string; wins: number; losses: number;
        placement: { seriesDone: number } | null }[];
    }).entries;
    expect(entries).toHaveLength(2);
    // one series each — both placing, W/L 1-0 / 0-1
    for (const e of entries) expect(e.placement).not.toBeNull();
    const win = entries.find((e) => e.playerId === U(5))!;
    const loss = entries.find((e) => e.playerId === U(6))!;
    expect([win.wins, win.losses]).toEqual([1, 0]);
    expect([loss.wins, loss.losses]).toEqual([0, 1]);

    const p = await handleRequest(deps, req("GET", `/v1/player/${U(5)}`));
    expect(p.status).toBe(200);
    const detail = p.body as { open: { wins: number; losses: number } };
    expect(detail.open.wins).toBe(1);
    expect(detail.open.losses).toBe(0);

    const status = await handleRequest(deps, req("GET", "/v1/status"));
    expect((status.body as { ratingGeneration: unknown }).ratingGeneration)
      .not.toBeNull();
  });

  it("events board + staff display resolve through PG (0010/0011)", async () => {
    const ev = await deps.events.create({
      name: "CI Fight Night", kind: "fight_night",
      whenMs: Date.now() + 86400_000, venue: "Gadgetzan", cap: 16,
      description: "pg test event",
    }, ACCT_A);
    expect(ev.id).toBeTruthy();

    const list = await deps.events.list(ACCT_A);
    const mine = list.find((e) => e.id === ev.id)!;
    expect(mine.managedByMe).toBe(true);
    // organizer staff row resolves to the account's character (0010 display join)
    expect(mine.staff).toEqual([
      { name: "Mangler", role: "organizer", playerId: U(5), wowClass: "warrior" },
    ]);

    const viaApi = await handleRequest(deps, req("GET", "/v1/events"));
    expect(viaApi.status).toBe(200);
    const ids = (viaApi.body as { events: { id: string }[] }).events.map((e) => e.id);
    expect(ids).toContain(ev.id);
  });

  it("createCharacter: lands at claimed tier, name_taken on re-claim", async () => {
    // fresh name per run — the CI database may persist between runs
    const name = `Ci${randomUUID().replace(/[^a-f]/gi, "").slice(0, 8)}`;
    const input = {
      accountId: ACCT_A, name, classId: 2, factionId: 0, level: 60,
      product: "wow-forever", environment: "beta", region: "EU",
      realmId: "forever",
    };
    const row = await deps.store.createCharacter(input);
    expect(row).not.toBe("name_taken");
    if (row === "name_taken") return;
    expect(row.accountId).toBe(ACCT_A);
    // the column default governs — self-registration can never mint a
    // higher tier (docs/26)
    expect(row.verificationTier).toBe("claimed");
    const read = await deps.store.getCharacter(row.id);
    expect(read?.verificationTier).toBe("claimed");

    // re-claim — different case, different account — is refused
    expect(await deps.store.createCharacter(
      { ...input, name: name.toUpperCase() })).toBe("name_taken");
    expect(await deps.store.createCharacter(
      { ...input, accountId: ACCT_B })).toBe("name_taken");
  });
});
