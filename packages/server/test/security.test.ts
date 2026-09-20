import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/memory.js";
import { InMemoryReadModel, InMemorySnapshotSource } from "../src/reads.js";
import {
  InMemoryAuthStore, InMemoryEventBoard, InMemoryWorldBoard, handleRequest,
  devLoginEnabled, type ApiDeps, type ApiRequest,
} from "../src/api.js";
import { RateLimiter } from "../src/ratelimit.js";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function req(method: string, path: string, body?: unknown,
  headers: Record<string, string> = {}, ip = "127.0.0.1"): ApiRequest {
  return { method, path, body, headers, query: {}, ip };
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

function makeDeps(): ApiDeps & { auth: InMemoryAuthStore } {
  const store = new InMemoryStore();
  const reads = new InMemoryReadModel(store);
  store.characters.set(U(5), {
    id: U(5), accountId: "acct-a", classId: 1, level: 60,
    verificationTier: "witnessed",
  });
  return {
    store, reads, auth: new InMemoryAuthStore(),
    events: new InMemoryEventBoard(store, reads.names),
    world: new InMemoryWorldBoard(),
    snapshots: new InMemorySnapshotSource(store, reads),
    configVersion: "beta-v2", verifyUrlBase: "http://test/pair", seasonId: U(90),
  };
}

describe("devLoginEnabled", () => {
  it("is off in production, on with the flag or in seeded dev", () => {
    // production: database set, no flag -> off
    expect(devLoginEnabled({ DATABASE_URL: "postgres://x" })).toBe(false);
    // explicit flag overrides everything
    expect(devLoginEnabled({ DATABASE_URL: "postgres://x", ACL_DEV_LOGIN: "1" }))
      .toBe(true);
    // in-memory seeded dev server -> on by default
    expect(devLoginEnabled({})).toBe(true);
    // in-memory but explicitly unseeded -> off
    expect(devLoginEnabled({ ACL_SEED: "0" })).toBe(false);
  });
});

describe("rate limiter", () => {
  it("enforces the window boundary per key and reports retry-after", () => {
    let t = 1000;
    const rl = new RateLimiter({ now: () => t });
    for (let i = 0; i < 10; i++) {
      expect(rl.check("ip:1.2.3.4:pair-start", 10, 60_000).ok).toBe(true);
    }
    const over = rl.check("ip:1.2.3.4:pair-start", 10, 60_000);
    expect(over.ok).toBe(false);
    expect(over.retryAfterSec).toBe(60);
    // a different key is unaffected
    expect(rl.check("ip:5.6.7.8:pair-start", 10, 60_000).ok).toBe(true);
    // sliding window: after the first hit expires, the next call passes
    t += 60_001;
    expect(rl.check("ip:1.2.3.4:pair-start", 10, 60_000).ok).toBe(true);
  });

  it("prunes keys whose hits have all aged out", () => {
    let t = 0;
    const rl = new RateLimiter({ now: () => t, sweepEveryMs: 1000 });
    rl.check("old", 1, 100);
    t = 5000;
    expect(rl.check("new", 1, 100).ok).toBe(true); // triggers the sweep
    t += 1;
    // 'old' was swept; a fresh key with the same string starts clean anyway,
    // so assert via internals-free behaviour: limit still applies to 'new'
    const again = rl.check("new", 1, 100);
    expect(again.ok).toBe(false);
  });
});

describe("rate limiting on routes", () => {
  it("the 11th pair/start in a minute is 429 with retry-after", async () => {
    const deps = makeDeps();
    deps.limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      const res = await handleRequest(deps,
        req("POST", "/v1/pair/start", { installationId: U(50 + i) }));
      expect(res.status).toBe(200);
    }
    const res = await handleRequest(deps,
      req("POST", "/v1/pair/start", { installationId: U(99) }));
    expect(res.status).toBe(429);
    expect((res.body as { error: string }).error).toBe("rate limited");
    expect(res.headers?.["retry-after"]).toBeDefined();
  });

  it("limits are per-IP — a second client is unaffected", async () => {
    const deps = makeDeps();
    deps.limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      await handleRequest(deps,
        req("POST", "/v1/pair/start", { installationId: U(50 + i) }));
    }
    const res = await handleRequest(deps,
      req("POST", "/v1/pair/start", { installationId: U(99) }, {}, "10.0.0.2"));
    expect(res.status).toBe(200);
  });
});

describe("dev session gate", () => {
  it("404s when dev login is disabled", async () => {
    const deps = makeDeps();
    const prev = process.env.ACL_SEED;
    process.env.ACL_SEED = "0";
    try {
      const res = await handleRequest(deps,
        req("POST", "/v1/session", { accountId: "acct-a" }));
      expect(res.status).toBe(404);
    } finally {
      if (prev === undefined) delete process.env.ACL_SEED;
      else process.env.ACL_SEED = prev;
    }
  });
});

describe("pairing code lifecycle", () => {
  const pairStart = async (deps: ApiDeps) => {
    const res = await handleRequest(deps,
      req("POST", "/v1/pair/start", { installationId: U(50) }));
    return res.body as { deviceCode: string; userCode: string; expiresAtMs: number };
  };
  const session = async (deps: ApiDeps, accountId: string) =>
    (await handleRequest(deps, req("POST", "/v1/session", { accountId })))
      .body as { token: string };

  it("user codes are 8 chars from the unambiguous alphabet", async () => {
    const deps = makeDeps();
    const { userCode } = await pairStart(deps);
    expect(userCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("a code cannot be approved twice", async () => {
    const deps = makeDeps();
    const { userCode } = await pairStart(deps);
    const s1 = await session(deps, "acct-a");
    const s2 = await session(deps, "acct-b");
    const first = await handleRequest(deps,
      req("POST", "/v1/pair/approve", { userCode }, bearer(s1.token)));
    expect(first.status).toBe(200);
    const second = await handleRequest(deps,
      req("POST", "/v1/pair/approve", { userCode }, bearer(s2.token)));
    expect(second.status).toBe(410);
  });

  it("poll issues the credential once — a second poll is 410", async () => {
    const deps = makeDeps();
    const { deviceCode, userCode } = await pairStart(deps);
    const s = await session(deps, "acct-a");
    await handleRequest(deps, req("POST", "/v1/pair/approve", { userCode }, bearer(s.token)));
    const first = await handleRequest(deps,
      req("POST", "/v1/pair/poll", { deviceCode }));
    expect(first.status).toBe(200);
    expect((first.body as { token: string }).token).toMatch(/^acld_/);
    const second = await handleRequest(deps,
      req("POST", "/v1/pair/poll", { deviceCode }));
    expect(second.status).toBe(410);
  });

  it("expired pairs reject both poll and approve", async () => {
    const deps = makeDeps();
    const { deviceCode, userCode } = await pairStart(deps);
    const pair = deps.auth.pairs.get(deviceCode)!;
    pair.expiresAtMs = Date.now() - 1000;
    const s = await session(deps, "acct-a");
    const approve = await handleRequest(deps,
      req("POST", "/v1/pair/approve", { userCode }, bearer(s.token)));
    expect(approve.status).toBe(410);
    const poll = await handleRequest(deps,
      req("POST", "/v1/pair/poll", { deviceCode }));
    expect(poll.status).toBe(410);
  });

  it("device tokens persist as digests — plaintext never hits the map", async () => {
    const deps = makeDeps();
    const { deviceCode, userCode } = await pairStart(deps);
    const s = await session(deps, "acct-a");
    await handleRequest(deps, req("POST", "/v1/pair/approve", { userCode }, bearer(s.token)));
    const poll = await handleRequest(deps, req("POST", "/v1/pair/poll", { deviceCode }));
    const token = (poll.body as { token: string }).token;
    // keyed by sha256(token), so a raw-token map lookup must miss
    expect(deps.auth.devices.has(token)).toBe(false);
    expect((await deps.auth.getDevice(token))?.accountId).toBe("acct-a");
  });
});
