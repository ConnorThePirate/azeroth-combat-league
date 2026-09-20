/**
 * api.ts — typed client for the ACL API (packages/server/src/api.ts).
 *
 * Set VITE_API_URL to talk to a live backend; when unset or unreachable,
 * useData() falls back to fixtures so the site works standalone.
 *
 * Sign-in: when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set the app
 * uses Supabase Auth (email + OAuth); the API validates the resulting
 * access token against /auth/v1/user. Without them everything behaves as
 * before — fixtures plus the labelled dev account-id login.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? null;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The Supabase Auth client — null unless both env vars are configured. */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export function apiConfigured(): boolean {
  return BASE !== null;
}

async function get<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`,
    token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
  if (!res.ok) throw new Error(`api ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`api ${path}: ${res.status} ${detail.slice(0, 120)}`);
  }
  return res.json() as Promise<T>;
}

export interface LeaderboardResponse {
  ladder: string;
  seasonId: string;
  entries: {
    rank: number; playerId: string; name: string; wowClass: string;
    rating: number; wins: number; losses: number;
    placement: { seriesDone: number; seriesNeeded: number;
      opponentsDone: number; opponentsNeeded: number } | null;
    tier: string;
  }[];
}

export interface MatchIndexItem {
  id: string;
  a: { playerId: string; name: string; wowClass: string };
  b: { playerId: string; name: string; wowClass: string };
  winnerId: string | null;
  scoreA: number; scoreB: number;
  bestOf: number;
  ladder: string | null;
  rulesetName: string;
  standard: boolean;
  status: string;
  evidence: string;
  reportsReceived: number;
  playedAtMs: number;
  receivedAtMs: number | null;
}

export interface RulesetRuleItem {
  ruleId: string;
  category: string;
  action: "allow" | "deny" | "limit";
  phase: string;
  itemIds?: number[];
  effectIds?: number[];
  countLimit?: number;
  detectorId?: string;
  sanction: "game_loss" | "void_game" | "none";
}

export interface RulesetItem {
  rulesetId: string;
  versionId: string;
  version: number;
  name: string;
  description: string;
  standard: boolean;
  rules: RulesetRuleItem[];
  publishedAtMs?: number;
}

export const api = {
  leaderboard: (ladder: "open" | "mirror") =>
    get<LeaderboardResponse>(`/v1/leaderboard?ladder=${ladder}`),
  matches: (limit = 50) =>
    get<{ matches: MatchIndexItem[]; generatedAtMs: number }>(`/v1/matches?limit=${limit}`),
  match: (id: string) => get<Record<string, unknown>>(`/v1/match/${id}`),
  player: (id: string) => get<Record<string, unknown>>(`/v1/player/${id}`),
  rulesets: () => get<{ rulesets: RulesetItem[]; generatedAtMs: number }>(`/v1/rulesets`),
  status: () => get<Record<string, unknown>>(`/v1/status`),
  uploadBatch: (token: string, reports: unknown[], envelopes?: string[], contracts?: unknown[]) =>
    post<{
      accepted: number; alreadyReceived: number; needsAttention: number;
      receipts: { nonce: string; receiptId: string; status: string }[];
    }>("/v1/reports/batch", { reports, envelopes, contracts }, token),
  events: (sessionToken?: string) =>
    get<{ events: (EventItem & { registered?: boolean })[]; generatedAtMs: number }>(
      "/v1/events", sessionToken),
  signupEvent: (eventId: string, token: string, characterId?: string) =>
    post<{ status: string; message: string }>(
      `/v1/events/${eventId}/signup`, { characterId }, token),
  session: (accountId: string) =>
    post<{ token: string }>("/v1/session", { accountId }),
  me: (token: string) =>
    get<MeResponse>("/v1/me", token),
  createCharacter: (input: CharacterInput, token: string) =>
    post<{ character: {
      id: string; name: string; classId: number; factionId: number;
      level: number; verificationTier: string;
    } }>("/v1/characters", input, token),
  world: () =>
    get<{
      war: WorldEntryItem[]; pit: WorldEntryItem[]; scoringLive: boolean;
    }>("/v1/world"),
  createEvent: (input: {
    name: string; kind: string; whenMs: number; venue: string;
    cap: number; description: string;
  }, token: string) =>
    post<{ event: EventItem }>("/v1/events", input, token),
  addEventStaff: (eventId: string, accountId: string, role: string, token: string) =>
    post<{ status: string; message: string }>(
      `/v1/events/${eventId}/staff`, { accountId, role }, token),
};

/** GET /v1/me — the signed-in account and its characters. */
export interface MeResponse {
  accountId: string;
  characters: {
    id: string; name: string; classId: number; verificationTier: string;
  }[];
}

/** POST /v1/characters body — self-registration lands at claimed tier. */
export interface CharacterInput {
  name: string; classId: number; factionId: number; level: number;
}

export interface WorldEntryItem {
  rank: number; playerId: string; name: string; wowClass: string;
  points: number; reports: number;
}

export interface EventItem {
  id: string; name: string;
  kind: "fight_night" | "mirror_cup" | "rookie_night" | "gurubashi";
  whenMs: number; venue: string;
  status: "upcoming" | "live" | "done";
  description: string; signups: number; cap: number;
  /** Staff display: character name + link/class when on record. */
  staff?: {
    name: string; role: "organizer" | "referee";
    playerId?: string; wowClass?: string;
  }[];
}

/** Storage can throw (private mode, sandboxed iframes) — never let it break render. */
const safeStorage = (s: () => Storage) => ({
  get(k: string): string | null { try { return s().getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { s().setItem(k, v); } catch { /* unavailable */ } },
  del(k: string): void { try { s().removeItem(k); } catch { /* unavailable */ } },
});
export const ls = safeStorage(() => localStorage);
export const ss = safeStorage(() => sessionStorage);

/** Dev sign-in until Battle.net OAuth lands — stored locally, never sent elsewhere. */
export function storedAccount(): string | null {
  return ls.get("acl.account");
}
export function storeAccount(accountId: string): void {
  ls.set("acl.account", accountId);
}
export function clearAccount(): void {
  ls.del("acl.account");
  ss.del("acl.session");
}

/**
 * The bearer token for authenticated API calls. A live Supabase session's
 * access_token wins; otherwise the cached dev-login token (local dev).
 */
export async function getSessionToken(): Promise<string | null> {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
      .catch(() => ({ data: { session: null } }));
    if (data.session?.access_token) return data.session.access_token;
  }
  return ss.get("acl.session");
}

/**
 * Token for authenticated calls: the Supabase JWT when signed in, else the
 * dev account-id login (POST /v1/session, dev server only — it 404s in
 * production, where the dev path is disabled by design).
 */
export async function ensureSession(accountId: string): Promise<string> {
  const tok = await getSessionToken();
  if (tok) return tok;
  const { token } = await api.session(accountId);
  ss.set("acl.session", token);
  return token;
}
