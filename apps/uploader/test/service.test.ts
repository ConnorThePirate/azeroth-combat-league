import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Spool } from "../src/spool.js";
import { FileCredentialStore } from "../src/credentials.js";
import { UploaderClient, UploadError, type HttpLike } from "../src/client.js";
import { CompanionService, extractPendingReports } from "../src/service.js";
import { parseSavedVariables } from "../src/luadata.js";

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "aclu-svc-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const SV = (nonces: string[], status = "queued") => `
AzerothCombatLeagueDB = {
	["reports"] = {
${nonces.map((n) => `		["${n}"] = { ["status"] = "${status}", ["body"] = { ["nonce"] = "${n}" } },`).join("\n")}
	},
}
`;

function installWith(svText: string): string {
  const root = join(dir, "wow");
  mkdirSync(join(root, "WTF", "Account", "ACCT", "SavedVariables"), { recursive: true });
  writeFileSync(
    join(root, "WTF", "Account", "ACCT", "SavedVariables", "AzerothCombatLeague.lua"), svText);
  return root;
}

describe("extractPendingReports", () => {
  it("pulls queued reports, skips acked", () => {
    const db = parseSavedVariables(SV(["a", "b"])).AzerothCombatLeagueDB as Record<string, unknown>;
    const { nonces, payloads } = extractPendingReports(db);
    expect(nonces).toEqual(["a", "b"]);
    expect(payloads).toHaveLength(2);
    const done = parseSavedVariables(SV(["c"], "acked")).AzerothCombatLeagueDB as Record<string, unknown>;
    expect(extractPendingReports(done).nonces).toEqual([]);
  });
});

describe("spool", () => {
  it("dedupes identical payloads and acked nonces", () => {
    const spool = new Spool(dir);
    const e1 = spool.add("f", { x: 1 }, ["n1"]);
    expect(e1).not.toBeNull();
    expect(spool.add("f", { x: 1 }, ["n1"])).toBe(e1); // same digest -> same entry
    spool.markDone(e1!);
    expect(spool.add("f", { x: 1 }, ["n1"])).toBeNull();      // done -> skip
    expect(spool.add("f", { x: 2 }, ["n1"])).toBeNull();      // acked nonce
    expect(spool.add("f", { x: 2 }, ["n2"])).not.toBeNull();  // new nonce
  });

  it("persists across restarts", () => {
    const s1 = new Spool(dir);
    const e = s1.add("f", { x: 1 }, ["n1"])!;
    s1.markDone(e);
    const s2 = new Spool(dir);
    expect(s2.isAcked("n1")).toBe(true);
  });
});

describe("client error taxonomy", () => {
  const mk = (status: number): HttpLike => async () => ({
    status, json: async () => ({}), text: async () => "",
  });
  it("classifies transient/auth/permanent", async () => {
    const c500 = new UploaderClient("http://x", mk(500));
    await expect(c500.uploadBatch("t", { reports: [] })).rejects.toMatchObject({ kind: "transient" });
    const c401 = new UploaderClient("http://x", mk(401));
    await expect(c401.uploadBatch("t", { reports: [] })).rejects.toMatchObject({ kind: "auth" });
    const c422 = new UploaderClient("http://x", mk(422));
    await expect(c422.uploadBatch("t", { reports: [] })).rejects.toMatchObject({ kind: "permanent" });
    const cnet = new UploaderClient("http://x", async () => { throw new Error("ECONNREFUSED"); });
    await expect(cnet.uploadBatch("t", { reports: [] })).rejects.toMatchObject({ kind: "transient" });
  });
});

describe("service end-to-end", () => {
  it("watches, extracts, spools and uploads queued reports", async () => {
    const root = installWith(SV(["n1", "n2"]));
    const sent: unknown[][] = [];
    const http: HttpLike = async (_url, init) => {
      if (init.method === "GET") {
        // addon-update fetch after upload — not an upload
        return { status: 200, json: async () => ({ update: "WFU1:eA:00000000" }), text: async () => "" };
      }
      sent.push([]);
      return { status: 200, json: async () => ({ accepted: 2, alreadyReceived: 0, needsAttention: 0, receipts: [] }), text: async () => "" };
    };
    const creds = new FileCredentialStore(join(dir, "ud"));
    await creds.set({ token: "tok", accountId: "acct", issuedAtMs: 0 });
    const spool = new Spool(join(dir, "ud"));
    const svc = new CompanionService(
      { installDir: root, serverUrl: "http://x" }, spool, creds,
      new UploaderClient("http://x", http));
    const svPath = join(root, "WTF", "Account", "ACCT", "SavedVariables", "AzerothCombatLeague.lua");
    await svc.onStableFile(svPath);
    expect(sent).toHaveLength(1);
    expect(spool.isAcked("n1")).toBe(true);
    // second pass — all acked, no new upload
    await svc.onStableFile(svPath);
    expect(sent).toHaveLength(1);
  });

  it("stages the WFU1 bundle as Data/Inbound.lua after upload", async () => {
    const root = installWith(SV(["n1"]));
    const http: HttpLike = async (url, init) => {
      if (init.method === "GET" && url.endsWith("/v1/addon-update")) {
        return {
          status: 200,
          json: async () => ({ update: "WFU1:QUJD:cafe0123", snapshotSequence: 7 }),
          text: async () => "",
        };
      }
      return {
        status: 200,
        json: async () => ({ accepted: 1, alreadyReceived: 0, needsAttention: 0, receipts: [] }),
        text: async () => "",
      };
    };
    const creds = new FileCredentialStore(join(dir, "ud"));
    await creds.set({ token: "tok", accountId: "acct", issuedAtMs: 0 });
    const svc = new CompanionService(
      { installDir: root, serverUrl: "http://x" }, new Spool(join(dir, "ud")), creds,
      new UploaderClient("http://x", http));
    await svc.onStableFile(
      join(root, "WTF", "Account", "ACCT", "SavedVariables", "AzerothCombatLeague.lua"));
    const inbound = join(root, "Interface", "AddOns", "AzerothCombatLeague", "Data", "Inbound.lua");
    const text = readFileSync(inbound, "utf8");
    expect(text).toContain('ACL_INBOUND_PAYLOAD = "WFU1:QUJD:cafe0123"');
  });

  it("requires auth and keeps evidence on 401", async () => {
    const root = installWith(SV(["n1"]));
    const http: HttpLike = async () => ({ status: 401, json: async () => ({}), text: async () => "" });
    const creds = new FileCredentialStore(join(dir, "ud"));
    await creds.set({ token: "bad", accountId: "acct", issuedAtMs: 0 });
    const spool = new Spool(join(dir, "ud"));
    const svc = new CompanionService(
      { installDir: root, serverUrl: "http://x" }, spool, creds,
      new UploaderClient("http://x", http));
    await svc.onStableFile(
      join(root, "WTF", "Account", "ACCT", "SavedVariables", "AzerothCombatLeague.lua"));
    expect(spool.isAcked("n1")).toBe(false);
    expect(svc.status().state).toBe("needs_auth");
    expect(spool.counts().pending).toBe(1); // evidence retained for retry
  });

  it("sweepNow picks up reports written by the exit-time flush", async () => {
    const root = installWith(SV(["n1"]));
    const svPath = join(root, "WTF", "Account", "ACCT", "SavedVariables",
      "AzerothCombatLeague.lua");
    const sent: unknown[][] = [];
    const http: HttpLike = async (_url, init) => {
      if (init.method === "GET") {
        return { status: 200, json: async () => ({ update: "WFU1:eA:00000000" }), text: async () => "" };
      }
      sent.push([]);
      return { status: 200, json: async () => ({ accepted: 1, alreadyReceived: 0, needsAttention: 0, receipts: [] }), text: async () => "" };
    };
    const creds = new FileCredentialStore(join(dir, "ud"));
    await creds.set({ token: "tok", accountId: "acct", issuedAtMs: 0 });
    const spool = new Spool(join(dir, "ud"));
    const svc = new CompanionService(
      { installDir: root, serverUrl: "http://x" }, spool, creds,
      new UploaderClient("http://x", http));
    svc.start();

    // the exit-time flush lands after the last poll: n2 appears on disk
    writeFileSync(svPath, SV(["n1", "n2"]));
    await svc.sweepNow();
    await svc.flushQueue();
    svc.stop();

    expect(sent).toHaveLength(1);            // one batch containing n1+n2
    expect(spool.isAcked("n2")).toBe(true);  // exit-flushed report uploaded
  });

  it("refuses to read files outside the allowlist", async () => {
    const outside = join(dir, "evil.lua");
    writeFileSync(outside, SV(["n9"]));
    const spool = new Spool(join(dir, "ud"));
    const creds = new FileCredentialStore(join(dir, "ud"));
    const svc = new CompanionService(
      { installDir: join(dir, "wow"), serverUrl: "http://x" }, spool, creds,
      new UploaderClient("http://x", async () => { throw new Error("nope"); }));
    await svc.onStableFile(outside);
    expect(spool.counts().pending).toBe(0); // never parsed
  });
});
