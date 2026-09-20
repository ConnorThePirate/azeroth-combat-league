import { describe, expect, it } from "vitest";
import { hashCanonical } from "@acl/contracts";
import type { MatchContract, MatchReport, SyncEnvelope } from "@acl/contracts";
import { InMemoryStore } from "../src/memory.js";
import { ingestEnvelope, type AuthContext } from "../src/ingest.js";
import { buildGeneration } from "../src/replay.js";
import type { CharacterRow } from "../src/store.js";

const U = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

const SEASON = U(100);
const POOL = U(101);

function makeContract(id: string, a: string, b: string): MatchContract {
  return {
    schema: "wf.match-contract.v2", sessionId: id, seasonId: SEASON, poolId: POOL,
    ladder: "open", ratedIntent: true, bestOf: 1, rulesetVersionId: U(4),
    participants: [{ characterId: a, side: 1 }, { characterId: b, side: 2 }],
    levelMin: 30, levelMax: 30,
    venue: { kind: "anywhere", mapId: null, areaId: null },
    tournamentMatchId: null,
    createdAtMs: 1000, acceptByMs: 2000, configVersion: "beta-v2",
  };
}

function makeReport(contract: MatchContract, origin: string, winner: string, nonce: string, installation: string): MatchReport {
  return {
    schema: "wf.match-report.v2",
    sessionId: contract.sessionId,
    contractHash: hashCanonical(contract as never),
    originCharacterId: origin,
    installationId: installation,
    nonce, build: "1.60.1.69913", addonVersion: "0.1.0", detectorCatalogVersion: "cat-0",
    proposedAtMs: 1000, acceptedAtMs: 1100, startedAtMs: 1200, finishedAtMs: 1300,
    games: [{
      index: 0, observedStartMs: 1200, observedEndMs: 1300,
      claimedWinnerCharacterId: winner, finishReason: "death",
      facts: [], interferenceCandidates: [], violationCandidates: [],
    }],
    coverage: [], attestations: [], peerDigests: [],
  };
}

function env(installation: string, reports: MatchReport[]): SyncEnvelope {
  return {
    schema: "wf.sync-envelope.v2", installationId: installation,
    build: "1.60.1.69913", addonVersion: "0.1.0",
    exportedAtMs: 2000, reports,
  };
}

function seed() {
  const store = new InMemoryStore();
  const chars: CharacterRow[] = [
    { id: U(5), accountId: "acct-a", classId: 8, level: 30, verificationTier: "witnessed" },
    { id: U(6), accountId: "acct-b", classId: 4, level: 30, verificationTier: "witnessed" },
    { id: U(7), accountId: "acct-a", classId: 1, level: 30, verificationTier: "witnessed" }, // A's alt
    { id: U(8), accountId: "acct-c", classId: 9, level: 22, verificationTier: "claimed" },
  ];
  for (const c of chars) store.characters.set(c.id, c);
  const authA: AuthContext = { accountId: "acct-a", installationId: U(50), authMethod: "helper" };
  const authB: AuthContext = { accountId: "acct-b", installationId: U(51), authMethod: "helper" };
  return { store, authA, authB };
}

describe("ingest + reconcile", () => {
  it("two independent agreeing reports -> corroborated -> rating_pending", async () => {
    const { store, authA, authB } = seed();
    const c = makeContract(U(1), U(5), U(6));
    const contracts = new Map([[c.sessionId, c]]);

    const r1 = await ingestEnvelope(store, authA, {
      envelope: env(U(50), [makeReport(c, U(5), U(5), "n1", U(50))]), contracts,
    });
    expect(r1.items[0]!.status).toBe("awaiting_peer");

    const r2 = await ingestEnvelope(store, authB, {
      envelope: env(U(51), [makeReport(c, U(6), U(5), "n1", U(51))]), contracts,
    });
    expect(r2.items[0]!.status).toBe("rating_pending");

    const m = await store.getMatch(c.sessionId);
    expect(m!.evidence).toBe("corroborated");
    expect(m!.rating).toBe("pending");
    expect(m!.receiptSeq).not.toBeNull();
  });

  it("a report cannot authenticate a peer just by carrying their body", async () => {
    const { store, authA } = seed();
    const c = makeContract(U(1), U(5), U(6));
    const contracts = new Map([[c.sessionId, c]]);
    // A submits BOTH reports — B's report has B's origin character
    const both = [
      makeReport(c, U(5), U(5), "n1", U(50)),
      makeReport(c, U(6), U(5), "n1", U(51)),
    ];
    const r = await ingestEnvelope(store, authA, {
      envelope: env(U(50), both), contracts,
    });
    expect(r.items[0]!.status).toBe("awaiting_peer");
    expect(r.items[1]!.status).toBe("rejected");
    expect(r.items[1]!.reasonCodes).toContain("identity_unverified");
    const m = await store.getMatch(c.sessionId);
    expect(m!.evidence).toBe("awaiting");
  });

  it("conflicting winner claims -> disputed -> held", async () => {
    const { store, authA, authB } = seed();
    const c = makeContract(U(1), U(5), U(6));
    const contracts = new Map([[c.sessionId, c]]);
    await ingestEnvelope(store, authA, {
      envelope: env(U(50), [makeReport(c, U(5), U(5), "n1", U(50))]), contracts,
    });
    const r = await ingestEnvelope(store, authB, {
      envelope: env(U(51), [makeReport(c, U(6), U(6), "n1", U(51))]), contracts,
    });
    expect(r.items[0]!.status).toBe("disputed");
    const m = await store.getMatch(c.sessionId);
    expect(m!.evidence).toBe("disputed");
    expect(m!.rating).toBe("held");
  });

  it("duplicate nonce + same digest dedupes; different digest rejects", async () => {
    const { store, authA } = seed();
    const c = makeContract(U(1), U(5), U(6));
    const contracts = new Map([[c.sessionId, c]]);
    const rep = makeReport(c, U(5), U(5), "n1", U(50));
    await ingestEnvelope(store, authA, { envelope: env(U(50), [rep]), contracts });
    const dup = await ingestEnvelope(store, authA, { envelope: env(U(50), [rep]), contracts });
    expect(dup.items[0]!.status).toBe("duplicate");

    const tampered = { ...rep, finishedAtMs: 1400 };
    const conflict = await ingestEnvelope(store, authA, { envelope: env(U(50), [tampered]), contracts });
    expect(conflict.items[0]!.status).toBe("rejected");
    expect(conflict.items[0]!.reasonCodes).toContain("duplicate_origin_nonce");
  });

  it("conflicting contract hash for same session is quarantined", async () => {
    const { store, authA, authB } = seed();
    const c = makeContract(U(1), U(5), U(6));
    const contracts = new Map([[c.sessionId, c]]);
    await ingestEnvelope(store, authA, {
      envelope: env(U(50), [makeReport(c, U(5), U(5), "n1", U(50))]), contracts,
    });
    // B reports a different contract hash for the same session id
    const badRep = makeReport(c, U(6), U(5), "n1", U(51));
    badRep.contractHash = "f".repeat(64);
    const r = await ingestEnvelope(store, authB, {
      envelope: env(U(51), [badRep]), contracts,
    });
    expect(r.items[0]!.status).toBe("rejected");
    expect((await store.getMatch(c.sessionId))!.evidence).toBe("disputed");
  });

  it("report without contract doc is rejected", async () => {
    const { store, authA } = seed();
    const c = makeContract(U(9), U(5), U(6));
    const r = await ingestEnvelope(store, authA, {
      envelope: env(U(50), [makeReport(c, U(5), U(5), "n1", U(50))]),
    });
    expect(r.items[0]!.status).toBe("rejected");
  });

  it("claimed-tier participants cannot become rating-pending", async () => {
    const { store, authA } = seed();
    const authC: AuthContext = { accountId: "acct-c", installationId: U(52), authMethod: "app_session" };
    const c = makeContract(U(1), U(5), U(8));
    const contracts = new Map([[c.sessionId, c]]);
    await ingestEnvelope(store, authA, {
      envelope: env(U(50), [makeReport(c, U(5), U(5), "n1", U(50))]), contracts,
    });
    const r = await ingestEnvelope(store, authC, {
      envelope: env(U(52), [makeReport(c, U(8), U(5), "n1", U(52))]), contracts,
    });
    expect(r.items[0]!.status).toBe("corroborated"); // corroborated but unrated
    expect((await store.getMatch(c.sessionId))!.rating).toBe("ineligible");
  });
});

describe("generation replay", () => {
  it("publishes a generation and detects stale revisions", async () => {
    const { store, authA, authB } = seed();
    const c = makeContract(U(1), U(5), U(6));
    const contracts = new Map([[c.sessionId, c]]);
    await ingestEnvelope(store, authA, {
      envelope: env(U(50), [makeReport(c, U(5), U(5), "n1", U(50))]), contracts,
    });
    await ingestEnvelope(store, authB, {
      envelope: env(U(51), [makeReport(c, U(6), U(5), "n1", U(51))]), contracts,
    });

    const res = await buildGeneration(store, SEASON, "gen-1");
    expect(res.status).toBe("published");
    expect(res.events).toBe(1);
    // U(5) < U(6) lexically, so A = char U(5) = winner
    const gen = store.generations.get("gen-1")!;
    const aRow = (gen.ledger as { participant: string; after_milli: number }[])
      .find((r) => r.participant === U(5))!;
    expect(aRow.after_milli).toBe(1516000);

    // a second build at the same revision is a no-change publish
    const res2 = await buildGeneration(store, SEASON, "gen-2");
    expect(res2.status).toBe("published");
  });
});
