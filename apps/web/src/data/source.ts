/**
 * source.ts — data hooks: API-first with fixture fallback (docs/12).
 *
 * Components call these hooks instead of importing fixture constants, so
 * the same pages render fixtures standalone and live data when VITE_API_URL
 * is configured. Any API failure falls back to fixtures and marks the data
 * as fixture-sourced — freshness UI can say so honestly.
 */
import { useEffect, useState } from "react";
import { api, apiConfigured, getSessionToken, type LeaderboardResponse, type MatchIndexItem, type RulesetItem } from "./api";
import {
  PLAYERS, MATCHES, RULESETS, EVENTS, STATUS, SERVER_NOW, ladder, WORLD,
} from "./fixtures";
import type {
  Player, MatchRecord, LeaderboardEntry, Ruleset, ClubEvent, SiteStatus,
  Ladder, Rival, WowClass, WorldBoard,
} from "./types";

export type DataSource = "live" | "fixture";

export interface DataState<T> {
  data: T;
  source: DataSource;
  loading: boolean;
}

/**
 * "Now" for freshness math: real time for live data, the fixture timestamp
 * for fixture data so demo content reads consistently.
 */
export function nowFor(source: DataSource): number {
  return source === "live" ? Date.now() : SERVER_NOW;
}

function useRemote<T>(fixture: T, fetcher: () => Promise<T | null>, deps: unknown[] = []): DataState<T> {
  const [state, setState] = useState<DataState<T>>({
    data: fixture, source: "fixture", loading: apiConfigured(),
  });
  useEffect(() => {
    setState({ data: fixture, source: "fixture", loading: apiConfigured() });
    if (!apiConfigured()) return;
    let live = true;
    fetcher()
      .then((d) => {
        if (live) setState(d
          ? { data: d, source: "live", loading: false }
          : { data: fixture, source: "fixture", loading: false });
      })
      .catch(() => { if (live) setState((s) => ({ ...s, loading: false })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function usePlayers(): DataState<Player[]> {
  return useRemote(PLAYERS, async () => null); // no bulk player endpoint yet — fixture
}

/** Index rows lack detail-only fields — fill honest defaults, detail loads on open. */
function toMatchRecord(m: MatchIndexItem): MatchRecord {
  return {
    ...m,
    a: { ...m.a, wowClass: m.a.wowClass as MatchRecord["a"]["wowClass"] },
    b: { ...m.b, wowClass: m.b.wowClass as MatchRecord["b"]["wowClass"] },
    ladder: m.ladder as MatchRecord["ladder"],
    status: m.status as MatchRecord["status"],
    evidence: m.evidence as MatchRecord["evidence"],
    games: [], ratingDelta: null, weightPercent: 100, ratedAtMs: null,
  };
}

export function useMatches(): DataState<MatchRecord[]> {
  return useRemote(MATCHES, async () =>
    (await api.matches()).matches.map(toMatchRecord));
}

export function useMatch(id: string | undefined): DataState<MatchRecord | undefined> {
  const fixture = MATCHES.find((m) => m.id === id);
  return useRemote(fixture, async () => {
    if (!id) return null;
    const m = await api.match(id);
    if (!m) return null;
    // API detail omits client-only fields — default them so nothing renders NaN
    return {
      ratingDelta: null, weightPercent: 100, note: undefined,
      ...fixture, ...(m as object), id,
    } as MatchRecord;
  }, [id]);
}

export function usePlayer(id: string | undefined): DataState<Player | undefined> {
  const fixture = PLAYERS.find((p) => p.id === id);
  return useRemote(fixture, async () => {
    if (!id) return null;
    const p = await api.player(id);
    // API returns open/mirror/lastActiveAtMs/realm in Player shape; fixture
    // fills anything absent (e.g. titles until achievements land)
    return p ? ({ ...fixture, ...(p as object), id } as Player) : null;
  }, [id]);
}

/** A player's own match history — not windowed by the global index. */
export function usePlayerMatches(id: string | undefined): DataState<MatchRecord[]> {
  const fixture = MATCHES.filter(
    (m) => m.a.playerId === id || m.b.playerId === id);
  return useRemote(fixture, async () => {
    if (!id) return null;
    const p = await api.player(id);
    const list = (p as { matches?: MatchIndexItem[] }).matches;
    return list ? list.map(toMatchRecord) : null;
  }, [id]);
}

/**
 * Client-side rivalry aggregate — same rule as the server's computeRivals:
 * W/L only from decided, non-disputed series; everything else counts as a
 * meeting. Derived from the player's match list so fixture mode behaves
 * identically to live mode.
 */
export function deriveRivals(playerId: string, matches: MatchRecord[], cap = 8): Rival[] {
  const map = new Map<string, Rival>();
  for (const m of matches) {
    const opp = m.a.playerId === playerId ? m.b : m.a;
    const r = map.get(opp.playerId) ?? {
      playerId: opp.playerId, name: opp.name, wowClass: opp.wowClass,
      wins: 0, losses: 0, meetings: 0, lastPlayedMs: 0,
    };
    r.meetings++;
    r.lastPlayedMs = Math.max(r.lastPlayedMs, m.playedAtMs);
    if (m.winnerId !== null && m.evidence !== "disputed") {
      if (m.winnerId === playerId) r.wins++; else r.losses++;
    }
    map.set(opp.playerId, r);
  }
  return [...map.values()]
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)
      || b.lastPlayedMs - a.lastPlayedMs)
    .slice(0, cap);
}

export function useLeaderboard(l: Ladder): DataState<LeaderboardEntry[]> {
  return useRemote(ladder(l), async () => {
    const res = await api.leaderboard(l);
    return res.entries.map((e) => ({
      rank: e.rank, playerId: e.playerId, name: e.name,
      wowClass: e.wowClass as LeaderboardEntry["wowClass"],
      rating: e.rating, wins: e.wins, losses: e.losses,
      placement: e.placement, tier: e.tier as LeaderboardEntry["tier"],
    }));
  }, [l]);
}

/** Map a server PublishedRuleset to the site's display shape (docs/08, 12). */
function toRuleset(rs: RulesetItem): Ruleset {
  const detectors = new Set(rs.rules.map((r) => r.detectorId).filter(Boolean));
  const coverageNote = detectors.size > 0
    ? `Coverage: ${[...detectors].join(", ")} — shown before every match; unknown coverage is never a pass.`
    : "No automated detectors — agreement is attested by both sides.";
  return {
    id: rs.versionId, name: rs.name,
    preset: rs.standard ? "standard" : "custom",
    standardEligible: rs.standard,
    immutable: true,
    version: rs.version, publishedAtMs: rs.publishedAtMs,
    coverageNote: rs.description ? `${rs.description} ${coverageNote}` : coverageNote,
    rules: rs.rules.map((r) => ({
      id: r.ruleId,
      category: r.category as Ruleset["rules"][number]["category"],
      action: r.action,
      phase: r.phase as Ruleset["rules"][number]["phase"],
      ...(r.countLimit !== undefined ? { count: r.countLimit } : {}),
      itemExceptions: (r.itemIds ?? []).map((id) => ({ id, name: `#${id}` })),
    })),
  };
}

export function useRulesets(): DataState<Ruleset[]> {
  return useRemote(RULESETS, async () =>
    (await api.rulesets()).rulesets.map(toRuleset));
}

export function useEvents(): DataState<ClubEvent[]> {
  return useRemote(EVENTS, async () => {
    // Supabase session or dev token — marks registered/managedByMe (api.ts)
    const token = (await getSessionToken()) ?? undefined;
    const res = await api.events(token);
    return res.events.map((e) => {
      const { staff, ...rest } = e;
      return {
        ...rest,
        ...(staff ? {
          staff: staff.map((s) => ({
            name: s.name, role: s.role,
            ...(s.playerId ? { playerId: s.playerId } : {}),
            ...(s.wowClass ? { wowClass: s.wowClass as WowClass } : {}),
          })),
        } : {}),
      };
    });
  });
}

export function useWorld(): DataState<WorldBoard> {
  return useRemote(WORLD, async () => {
    const w = await api.world();
    const map = (rows: { rank: number; playerId: string; name: string;
      wowClass: string; points: number; reports: number }[]) =>
      rows.map((r) => ({ ...r, wowClass: r.wowClass as WowClass }));
    return { war: map(w.war), pit: map(w.pit), scoringLive: w.scoringLive };
  });
}

export function useStatus(): DataState<SiteStatus> {
  return useRemote(STATUS, async () => {
    const s = await api.status();
    return { ...STATUS, ...(s as object) } as SiteStatus;
  });
}
