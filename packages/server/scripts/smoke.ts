/* HTTP smoke test: pair → approve → upload report → dedupe → status. */
import { startServer, createDeps, seedContract } from "../src/serve.js";
import { hashCanonical, decodeUpdate } from "@acl/contracts";
import type { MatchContract, MatchReport } from "@acl/contracts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEASON = "00000000-0000-4000-8000-0000000000aa";
const BASE = "http://localhost:8797";
const post = (p: string, b: unknown, t?: string) =>
  fetch(`${BASE}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify(b),
  }).then((r) => r.json());
const get = (p: string) => fetch(`${BASE}${p}`).then((r) => r.json());

const srv = await startServer(8797);

const contract = seedContract();
const report = (origin: string, inst: string, nonce: string, winner: string): MatchReport => ({
  schema: "wf.match-report.v2", sessionId: U(1),
  contractHash: hashCanonical(contract as never),
  originCharacterId: origin, installationId: inst, nonce,
  build: "69913", addonVersion: "0.1.0", detectorCatalogVersion: "cat-0",
  proposedAtMs: 1, acceptedAtMs: 2, startedAtMs: 3, finishedAtMs: 4,
  games: [0, 1].map((index) => ({
    index, observedStartMs: null, observedEndMs: null,
    claimedWinnerCharacterId: winner, finishReason: "death",
    facts: [], interferenceCandidates: [], violationCandidates: [],
  })),
  coverage: [], attestations: [], peerDigests: [],
});

// 1. pair + approve (Mangler's account)
const pair = await post("/v1/pair/start", { installationId: U(50) }) as { userCode: string; deviceCode: string };
const session = await post("/v1/session", { accountId: "acct-a" }) as { token: string };
await post("/v1/pair/approve", { userCode: pair.userCode }, session.token);
const poll = await post("/v1/pair/poll", { deviceCode: pair.deviceCode }) as { token?: string };
console.log("pair:", poll.token ? "OK token issued" : "FAIL");

// 2. second device for Sneakthief
const pair2 = await post("/v1/pair/start", { installationId: U(51) }) as { userCode: string; deviceCode: string };
const session2 = await post("/v1/session", { accountId: "acct-b" }) as { token: string };
await post("/v1/pair/approve", { userCode: pair2.userCode }, session2.token);
const poll2 = await post("/v1/pair/poll", { deviceCode: pair2.deviceCode }) as { token?: string };

// 3. both participants report the seeded match
const up1 = await post("/v1/reports/batch",
  { reports: [report(U(5), U(50), "smoke-a", U(5))], contracts: [contract] }, poll.token!);
const up2 = await post("/v1/reports/batch",
  { reports: [report(U(6), U(51), "smoke-b", U(5))], contracts: [] }, poll2.token!);
console.log("upload A:", JSON.stringify(up1).slice(0, 200));
console.log("upload B:", JSON.stringify(up2).slice(0, 200));

// 4. duplicate upload → dedupe, not error
const dup = await post("/v1/reports/batch",
  { reports: [report(U(5), U(50), "smoke-a", U(5))], contracts: [] }, poll.token!);
console.log("dup:", JSON.stringify(dup).slice(0, 120));

// 5. match detail + index + status
const detail = await get(`/v1/match/${U(1)}`);
console.log("match:", JSON.stringify({ evidence: detail.evidence, rating: detail.rating }));
const idx = await get("/v1/matches");
console.log("matches:", idx.matches.map((m: { a: { name: string }; b: { name: string };
  status: string }) => `${m.a.name} v ${m.b.name} [${m.status}]`).join("; "));
const player = await get(`/v1/player/${U(5)}`);
console.log("player:", JSON.stringify({
  name: player.name, open: player.open,
  matches: (player.matches ?? []).length,
  rivals: (player.rivals ?? []).map((r: { name: string; wins: number; losses: number }) =>
    `${r.name} ${r.wins}-${r.losses}`),
}));
// 6. events: list + signup as acct-a (session)
const evts = await get("/v1/events");
const ev0 = evts.events[0];
const su = await post(`/v1/events/${ev0.id}/signup`, {}, session.token);
console.log("events:", evts.events.map((e: { name: string; signups: number }) =>
  `${e.name}(${e.signups})`).join("; "), "| signup:", su.status);
// 7. published rulesets — the addon + site read the same source
const rs = await get("/v1/rulesets");
console.log("rulesets:", rs.rulesets.map((r: { name: string; version: number;
  standard: boolean }) => `${r.name} v${r.version}${r.standard ? " [standard]" : ""}`).join("; "));

// 8. WFU1 bundle for the companion — receipts + rulesets back to the addon
const wfu = await fetch(`${BASE}/v1/addon-update`,
  { headers: { authorization: `Bearer ${poll.token}` } }).then((r) => r.json());
console.log("addon-update:", wfu.update.slice(0, 24) + "…",
  "seq", wfu.snapshotSequence, "— decodes:", decodeUpdate(wfu.update).accountId);
console.log("status:", (await get("/v1/status")).configVersion);

srv.close();
process.exit(0);
