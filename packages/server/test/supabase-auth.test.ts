/**
 * supabase-auth.test.ts — SupabaseSessionValidator unit tests.
 *
 * fetch is stubbed (vi.stubGlobal) to fake GoTrue's /auth/v1/user, and the
 * pool is a stubbed query() emulating the three provisioning statements —
 * the select on accounts.auth_user_id plus the profiles/accounts inserts —
 * so no real database is needed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Pool } from "pg";
import { PgAuthStore, SupabaseSessionValidator } from "../src/pg.js";

const SB_URL = "https://proj.supabase.co";
const SB_KEY = "anon-key";
const AUTH_USER = "11111111-2222-4333-8444-555555555555";

/** Minimal pool stand-in: just the queries the provisioning path runs. */
function fakePool() {
  const profiles = new Map<string, string>(); // public_slug -> id
  const accounts = new Map<string, string>(); // auth_user_id -> account id
  let profileSeq = 0, accountSeq = 0;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/select id from accounts where auth_user_id/.test(sql)) {
      const id = accounts.get(params[0] as string);
      return { rows: id ? [{ id }] : [] };
    }
    if (/insert into profiles/.test(sql)) {
      const slug = params[0] as string;
      if (profiles.has(slug)) {
        const e = new Error("duplicate key") as Error & { code?: string };
        e.code = "23505";
        throw e;
      }
      const id = `profile-${++profileSeq}`;
      profiles.set(slug, id);
      return { rows: [{ id }] };
    }
    if (/insert into accounts/.test(sql)) {
      const authUserId = params[1] as string;
      if (accounts.has(authUserId)) return { rows: [] }; // on conflict do nothing
      const id = `acct-${++accountSeq}`;
      accounts.set(authUserId, id);
      return { rows: [{ id }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  return { pool: { query } as unknown as Pool, profiles, accounts, query };
}

function stubUser(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const okUser = (meta: Record<string, unknown> = {}, email?: string) =>
  stubUser(200, { id: AUTH_USER, email, user_metadata: meta });

afterEach(() => vi.unstubAllGlobals());

describe("SupabaseSessionValidator", () => {
  it("returns null immediately when env is unset — fetch never runs", async () => {
    const fetchMock = stubUser(200, { id: AUTH_USER });
    const { pool, query } = fakePool();
    const v = new SupabaseSessionValidator(pool, null, null);
    expect(v.configured).toBe(false);
    expect(await v.getSession("tok")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("valid token -> provisions profile+account once, returns SessionToken", async () => {
    const fetchMock = okUser({ name: "Mangler" }, "mangler@example.com");
    const { pool, profiles, accounts, query } = fakePool();
    const v = new SupabaseSessionValidator(pool, SB_URL, SB_KEY);
    expect(v.configured).toBe(true);

    const s = await v.getSession("tok-valid");
    expect(s).toMatchObject({ token: "tok-valid", accountId: "acct-1" });
    expect(typeof s!.issuedAtMs).toBe("number");

    // validation hit GoTrue once with both headers
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as
      [string, { headers: Record<string, string> }];
    expect(url).toBe(`${SB_URL}/auth/v1/user`);
    expect(init.headers.apikey).toBe(SB_KEY);
    expect(init.headers.authorization).toBe("Bearer tok-valid");

    // provisioning: profile slug came from user_metadata.name, one account
    expect(profiles.has("mangler")).toBe(true);
    expect(accounts.get(AUTH_USER)).toBe("acct-1");
    // select + insert profile + insert account = 3 queries
    expect(query).toHaveBeenCalledTimes(3);

    // second call is a cache hit — no fetch, no DB
    const s2 = await v.getSession("tok-valid");
    expect(s2).toEqual(s);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("a later validation reuses the provisioned account (no re-insert)", async () => {
    // fresh validator over the same pool state = expired cache / restart
    const fetchMock = okUser({});
    const { pool, accounts, query } = fakePool();
    await new SupabaseSessionValidator(pool, SB_URL, SB_KEY).getSession("tok");
    const v2 = new SupabaseSessionValidator(pool, SB_URL, SB_KEY);
    const s = await v2.getSession("tok");
    expect(s?.accountId).toBe("acct-1");
    expect(accounts.size).toBe(1);
    // this validation ran select only — no new inserts
    expect(query.mock.calls.filter(([sql]) => /insert/.test(sql as string)))
      .toHaveLength(2); // both from the first validator
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalid token -> null, negatively cached", async () => {
    const fetchMock = stubUser(401);
    const { pool, query } = fakePool();
    const v = new SupabaseSessionValidator(pool, SB_URL, SB_KEY);
    expect(await v.getSession("tok-bad")).toBeNull();
    expect(await v.getSession("tok-bad")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // 30s negative cache
    expect(query).not.toHaveBeenCalled();
  });

  it("network failure -> null (degrades to 401, never throws)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    const { pool } = fakePool();
    const v = new SupabaseSessionValidator(pool, SB_URL, SB_KEY);
    expect(await v.getSession("tok")).toBeNull();
  });

  it("falls back to a player-<hex> slug when metadata has no usable name", async () => {
    okUser({}); // no name/full_name, no email
    const { pool, profiles } = fakePool();
    const v = new SupabaseSessionValidator(pool, SB_URL, SB_KEY);
    expect(await v.getSession("tok")).not.toBeNull();
    expect([...profiles.keys()][0]).toBe(`player-${AUTH_USER.replace(/-/g, "").slice(0, 8)}`);
  });

  it("PgAuthStore delegates getSession to the validator via env", async () => {
    okUser({ full_name: "Sneak Thief" });
    const { pool, profiles } = fakePool();
    const auth = new PgAuthStore(pool, {
      SUPABASE_URL: SB_URL, SUPABASE_ANON_KEY: SB_KEY,
    });
    expect(auth.supabaseAuthConfigured).toBe(true);
    const s = await auth.getSession("tok-pg");
    expect(s?.accountId).toBe("acct-1");
    expect(profiles.has("sneak-thief")).toBe(true);
    // env unset -> configured off, session null
    const off = new PgAuthStore(pool, {});
    expect(off.supabaseAuthConfigured).toBe(false);
    expect(await off.getSession("tok-pg")).toBeNull();
  });
});
