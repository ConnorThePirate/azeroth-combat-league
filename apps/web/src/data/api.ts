/**
 * api.ts — typed client for the ACL API (packages/server/src/api.ts).
 *
 * Set VITE_API_URL to talk to a live backend; when unset or unreachable,
 * useData() falls back to fixtures so the site works standalone.
 */

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? null;

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
export async function ensureSession(accountId: string): Promise<string> {
  const cached = ss.get("acl.session");
  if (cached) return cached;
  const { token } = await api.session(accountId);
  ss.set("acl.session", token);
  return token;
}
