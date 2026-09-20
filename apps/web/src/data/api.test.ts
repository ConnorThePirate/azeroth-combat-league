/**
 * api.test.ts — auth-token plumbing in the data layer.
 *
 * import.meta.env is read at module load, so each test resets modules and
 * re-imports ./api under different env stubs. localStorage/sessionStorage
 * are stubbed — vitest runs in node, where neither exists.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

function stubStorage() {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
      clear: () => m.clear(),
      key: () => null,
      get length() { return m.size; },
    };
  };
  vi.stubGlobal("localStorage", mem());
  vi.stubGlobal("sessionStorage", mem());
}

beforeEach(stubStorage);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("api data layer — env absent (unchanged dev path)", () => {
  it("is fixture-only with no supabase client", async () => {
    const { apiConfigured, supabase } = await import("./api");
    expect(apiConfigured()).toBe(false);
    expect(supabase).toBeNull();
  });

  it("getSessionToken returns the cached dev token or null", async () => {
    const { getSessionToken, ss } = await import("./api");
    expect(await getSessionToken()).toBeNull();
    ss.set("acl.session", "devtok");
    expect(await getSessionToken()).toBe("devtok");
  });
});

describe("api data layer — supabase env present", () => {
  it("creates the client; no session -> dev-token fallback still works", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    // node 20 has no global WebSocket; the realtime subsystem only resolves
    // the constructor at client init — a dummy class suffices (never used)
    vi.stubGlobal("WebSocket", class {});
    vi.resetModules();
    const { supabase, getSessionToken, ss } = await import("./api");
    expect(supabase).not.toBeNull();
    // no stored supabase session in the stubbed storage -> dev fallback
    ss.set("acl.session", "devtok");
    expect(await getSessionToken()).toBe("devtok");
  });
});
