import { describe, expect, it } from "vitest";
import {
  validateAddonUpdate, validateContract, validateReport, validateSyncEnvelope,
} from "../src/validate.js";
import type { AddonUpdate, MatchContract, MatchReport, SyncEnvelope } from "../src/types.js";

const U = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

const contract: MatchContract = {
  schema: "wf.match-contract.v2",
  sessionId: U(1), seasonId: U(2), poolId: U(3),
  ladder: "open", ratedIntent: true, bestOf: 3,
  rulesetVersionId: U(4),
  participants: [
    { characterId: U(5), side: 1 },
    { characterId: U(6), side: 2 },
  ],
  levelMin: 20, levelMax: 20,
  venue: { kind: "anywhere", mapId: null, areaId: null },
  tournamentMatchId: null,
  createdAtMs: 1789833600000, acceptByMs: 1789834500000,
  configVersion: "beta-v2",
};

const report: MatchReport = {
  schema: "wf.match-report.v2",
  sessionId: U(1),
  contractHash: "a".repeat(64),
  originCharacterId: U(5),
  installationId: U(7),
  nonce: "nonce-1",
  build: "1.60.1.69913",
  addonVersion: "0.1.0",
  detectorCatalogVersion: "cat-0",
  proposedAtMs: 1789833600000, acceptedAtMs: 1789833610000,
  startedAtMs: 1789833620000, finishedAtMs: 1789833680000,
  games: [{
    index: 0, observedStartMs: 1789833620000, observedEndMs: 1789833680000,
    claimedWinnerCharacterId: U(5), finishReason: "death",
    facts: [], interferenceCandidates: [], violationCandidates: [],
  }],
  coverage: [{ ruleId: "std.no-potions", status: "observable", gameIndex: 0, intervalStartMs: 1, intervalEndMs: 2 }],
  attestations: [],
  peerDigests: [],
};

const envelope: SyncEnvelope = {
  schema: "wf.sync-envelope.v2",
  installationId: U(7), build: "1.60.1.69913", addonVersion: "0.1.0",
  exportedAtMs: 1789833700000, reports: [report],
};

const update: AddonUpdate = {
  schema: "wf.addon-update.v1",
  accountId: U(8), snapshotSequence: 3, issuedAtMs: 1789833800000,
  characters: [{
    characterId: U(5),
    ladders: [{
      seasonId: U(2), poolId: U(3), ladder: "open",
      ratingMilli: 1516000, placementSeries: 10, placementOpponents: 5,
      generationId: U(9),
    }],
  }],
  receipts: [{
    installationId: U(7), nonce: "nonce-1", bodyDigest: "b".repeat(64),
    receiptId: U(10), status: "corroborated",
  }],
  configVersion: "beta-v2",
};

describe("validateContract", () => {
  it("accepts the documented contract shape", () => {
    expect(validateContract(contract)).toEqual([]);
  });
  it("rejects duplicate character / same side", () => {
    const bad = structuredClone(contract);
    bad.participants[1].characterId = bad.participants[0].characterId;
    expect(validateContract(bad).some((e) => e.code === "business")).toBe(true);
    const bad2 = structuredClone(contract);
    bad2.participants[1].side = 1;
    expect(validateContract(bad2).some((e) => e.code === "business")).toBe(true);
  });
  it("rejects rated contract without ladder (custom must be unrated)", () => {
    const bad = structuredClone(contract);
    bad.ladder = null;
    expect(validateContract(bad).some((e) => e.path.endsWith("ratedIntent"))).toBe(true);
  });
  it("rejects bad bestOf and inverted levels", () => {
    const bad = structuredClone(contract);
    bad.bestOf = 2 as never;
    bad.levelMin = 30; bad.levelMax = 20;
    const errs = validateContract(bad);
    expect(errs.some((e) => e.path.endsWith("bestOf"))).toBe(true);
    expect(errs.some((e) => e.path.endsWith("levelMin"))).toBe(true);
  });
  it("rejects expiry before creation", () => {
    const bad = structuredClone(contract);
    bad.acceptByMs = bad.createdAtMs - 1;
    expect(validateContract(bad).length).toBeGreaterThan(0);
  });
});

describe("validateReport / validateSyncEnvelope", () => {
  it("accepts a complete report and envelope", () => {
    expect(validateReport(report)).toEqual([]);
    expect(validateSyncEnvelope(envelope)).toEqual([]);
  });
  it("rejects bad hashes and finish reasons", () => {
    const bad = structuredClone(report);
    bad.contractHash = "xyz";
    bad.games[0]!.finishReason = "exploded" as never;
    const errs = validateReport(bad);
    expect(errs.some((e) => e.path.includes("contractHash"))).toBe(true);
    expect(errs.some((e) => e.path.includes("finishReason"))).toBe(true);
  });
  it("enforces the 25-report envelope cap", () => {
    const big = structuredClone(envelope);
    big.reports = Array.from({ length: 26 }, () => structuredClone(report));
    expect(validateSyncEnvelope(big).some((e) => e.code === "length")).toBe(true);
  });
});

describe("validateAddonUpdate", () => {
  it("accepts a valid update bundle", () => {
    expect(validateAddonUpdate(update)).toEqual([]);
  });
  it("rejects stale sequence numbers at structural level", () => {
    const bad = structuredClone(update);
    bad.snapshotSequence = 0;
    expect(validateAddonUpdate(bad).length).toBeGreaterThan(0);
  });
  it("enforces receipt and snapshot caps", () => {
    const bad = structuredClone(update);
    bad.receipts = Array.from({ length: 26 }, () => structuredClone(update.receipts[0]!));
    expect(validateAddonUpdate(bad).some((e) => e.code === "length")).toBe(true);
  });

  const ruleset = {
    rulesetId: U(20), versionId: U(21), version: 1,
    name: "Ranked Standard",
    description: "Class abilities, self buffs, bandages.",
    standard: true,
    rules: [
      { ruleId: "std.consumables", category: "consumable", action: "deny",
        phase: "active", detectorId: "combat_log.use", sanction: "game_loss" },
      { ruleId: "std.bandage-cap", category: "bandage", action: "limit",
        phase: "active", countLimit: 3, itemIds: [1251, 6451],
        sanction: "game_loss" },
    ],
  };

  it("accepts a bundle carrying published rulesets", () => {
    const u = structuredClone(update);
    u.rulesets = [structuredClone(ruleset)] as never;
    expect(validateAddonUpdate(u)).toEqual([]);
  });
  it("omitted rulesets stay valid (additive field)", () => {
    expect(update.rulesets).toBeUndefined();
    expect(validateAddonUpdate(update)).toEqual([]);
  });
  it("rejects invalid rule action / phase / sanction", () => {
    const u = structuredClone(update);
    const rs = structuredClone(ruleset);
    rs.rules[0]!.action = "explode" as never;
    rs.rules[1]!.phase = "whenever" as never;
    u.rulesets = [rs] as never;
    const errs = validateAddonUpdate(u);
    expect(errs.filter((e) => e.code === "enum").length).toBeGreaterThanOrEqual(2);
  });
  it("rejects oversized rulesets and id lists", () => {
    const u = structuredClone(update);
    const big = structuredClone(ruleset);
    big.rules = Array.from({ length: 65 }, (_, i) =>
      ({ ...structuredClone(ruleset.rules[0]!), ruleId: `r${i}` }));
    u.rulesets = [big] as never;
    expect(validateAddonUpdate(u).some((e) =>
      e.path.endsWith("rules") && e.code === "length")).toBe(true);

    const u2 = structuredClone(update);
    const ids = structuredClone(ruleset);
    ids.rules[1]!.itemIds = Array.from({ length: 33 }, (_, i) => i);
    u2.rulesets = [ids] as never;
    expect(validateAddonUpdate(u2).some((e) =>
      e.path.includes("itemIds") && e.code === "length")).toBe(true);
  });
  it("caps the ruleset count at 16", () => {
    const u = structuredClone(update);
    u.rulesets = Array.from({ length: 17 }, (_, i) => ({
      ...structuredClone(ruleset), versionId: U(100 + i),
    })) as never;
    expect(validateAddonUpdate(u).some((e) =>
      e.path.endsWith("rulesets") && e.code === "length")).toBe(true);
  });
  it("rejects malformed ruleset identity fields", () => {
    const u = structuredClone(update);
    const rs = structuredClone(ruleset);
    rs.versionId = "not-a-uuid";
    rs.version = 0;
    rs.standard = "yes" as never;
    u.rulesets = [rs] as never;
    const errs = validateAddonUpdate(u);
    expect(errs.some((e) => e.path.includes("versionId"))).toBe(true);
    expect(errs.some((e) => e.path.includes("version"))).toBe(true);
    expect(errs.some((e) => e.path.includes("standard"))).toBe(true);
  });
});
