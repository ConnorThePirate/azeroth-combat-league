/**
 * reads.ts — ReadModel over InMemoryStore for the dev server + tests (docs/12).
 *
 * Boards read ONLY published generation members — never live tables — so the
 * site always shows generation-stamped data. A Postgres impl maps to views
 * over rating_generation_members once the DB binding lands.
 */

import type { MatchContract, MatchReport, PublishedRuleset, UpdateReceipt } from "@acl/contracts";
import type { MatchIndexEntry, ReadModel } from "./api.js";
import type { InMemoryStore } from "./memory.js";
import type { MemberRow } from "./replay.js";
import type { SnapshotSource } from "./snapshot.js";

const CLASS_NAMES: Record<number, string> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
  6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
};

export interface RivalEntry {
  playerId: string; name: string; wowClass: string;
  wins: number; losses: number; meetings: number; lastPlayedMs: number;
}

/**
 * Rivalry aggregate (docs/12 "rivals"): W/L counts only decided,
 * non-disputed series — pending and contested meetings count as meetings,
 * never as wins or losses for either side.
 */
export function computeRivals(
  playerId: string, matches: MatchIndexEntry[], cap = 8,
): RivalEntry[] {
  const map = new Map<string, RivalEntry>();
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

export class InMemoryReadModel implements ReadModel {
  /** characterId -> display name (dev seed only; prod resolves via accounts) */
  names = new Map<string, string>();
  /** versionId -> published ruleset (dev seed + tests) */
  publishedRulesets = new Map<string, PublishedRuleset>();
  configVersion = "beta-v2";

  constructor(private readonly s: InMemoryStore) {}

  seedRuleset(rs: PublishedRuleset): void {
    this.publishedRulesets.set(rs.versionId, rs);
  }

  async rulesets() {
    // newest published version per ruleset, standard first
    const newest = new Map<string, PublishedRuleset>();
    for (const rs of this.publishedRulesets.values()) {
      const cur = newest.get(rs.rulesetId);
      if (!cur || rs.version > cur.version) newest.set(rs.rulesetId, rs);
    }
    return [...newest.values()].sort((a, b) =>
      (b.standard ? 1 : 0) - (a.standard ? 1 : 0) || a.name.localeCompare(b.name));
  }

  private activeMembers(seasonId: string, ladder: "open" | "mirror"): MemberRow[] {
    const head = this.s.heads.get(seasonId);
    if (!head?.activeGenerationId) return [];
    const gen = this.s.generations.get(head.activeGenerationId);
    if (!gen) return [];
    return (gen.members as MemberRow[]).filter((m) => {
      const [season, , , lad] = JSON.parse(m.ladder_key) as string[];
      return season === seasonId && lad === ladder;
    });
  }

  /**
   * Decided-series W/L per character on one ladder — the same rule the
   * player page uses: finished, not disputed, winner known from the
   * reconciled games (null-ladder contracts count toward open, matching
   * playerDetail's ladder split).
   */
  private async decidedWinLoss(ladder: "open" | "mirror") {
    const map = new Map<string, { wins: number; losses: number }>();
    for (const id of this.s.contracts.keys()) {
      const s = await this.summarize(id);
      const m = s ? this.s.matches.get(id)! : null;
      if (!s || !m) continue;
      const lad = s.ladder === "mirror" ? "mirror" : "open";
      if (lad !== ladder || m.lifecycle !== "finished") continue;
      if (s.winnerId === null || m.evidence === "disputed") continue;
      for (const p of [s.a, s.b]) {
        const rec = map.get(p.playerId) ?? { wins: 0, losses: 0 };
        if (s.winnerId === p.playerId) rec.wins++; else rec.losses++;
        map.set(p.playerId, rec);
      }
    }
    return map;
  }

  async leaderboard(seasonId: string, ladder: "open" | "mirror") {
    const need = ladder === "mirror" ? { series: 6, opponents: 3 } : { series: 10, opponents: 5 };
    const wl = await this.decidedWinLoss(ladder);
    const rows = this.activeMembers(seasonId, ladder).map((m) => {
      const ch = this.s.characters.get(m.character_id);
      return {
        m,
        placing: m.positive_series < need.series || m.distinct_opponents < need.opponents,
        name: this.names.get(m.character_id) ?? m.character_id.slice(0, 8),
        ch,
        wl: wl.get(m.character_id) ?? { wins: 0, losses: 0 },
      };
    });
    // rated players first by rating (ties: wins then name), then placing
    // players by placement progress — placing rows never consume a rank slot
    const rated = rows.filter((r) => !r.placing).sort((a, b) =>
      b.m.rating_milli - a.m.rating_milli || b.wl.wins - a.wl.wins
      || a.name.localeCompare(b.name));
    const placing = rows.filter((r) => r.placing).sort((a, b) =>
      b.m.positive_series - a.m.positive_series
      || b.m.distinct_opponents - a.m.distinct_opponents
      || a.name.localeCompare(b.name));
    return [...rated, ...placing].map((r, i) => ({
      rank: i + 1,
      playerId: r.m.character_id,
      name: r.name,
      wowClass: CLASS_NAMES[r.ch?.classId ?? 0] ?? "unknown",
      rating: r.placing ? 0 : Math.round(r.m.rating_milli / 1000),
      wins: r.wl.wins,
      losses: r.wl.losses,
      placement: r.placing ? {
        seriesDone: r.m.positive_series, seriesNeeded: need.series,
        opponentsDone: r.m.distinct_opponents, opponentsNeeded: need.opponents,
      } : null,
      tier: r.ch?.verificationTier ?? "claimed",
    }));
  }

  /** Shared summary — list cards and detail pages tell the same story. */
  private async summarize(matchId: string): Promise<(MatchIndexEntry & {
    games: { index: number; winnerId: string | null; reason: string; voided: boolean }[];
    side: { side: number; characterId: string }[];
    ratedAtMs: number | null;
  }) | null> {
    const m = this.s.matches.get(matchId);
    const c = this.s.contracts.get(matchId);
    if (!m || !c) return null;
    const contract = c.canonical as MatchContract;
    const games = await this.s.matchGames(matchId);
    const reports = this.s.reports.get(matchId) ?? [];
    const parts = this.s.participants.get(matchId) ?? [];
    const name = (cid: string) => this.names.get(cid) ?? cid.slice(0, 8);
    const cls = (cid: string) => CLASS_NAMES[this.s.characters.get(cid)?.classId ?? 0] ?? "unknown";
    const [a, b] = contract.participants;
    const score = (cid: string) => games.filter((g) => g.winnerCharacterId === cid).length;
    const scoreA = score(a!.characterId), scoreB = score(b!.characterId);
    const winnerId = scoreA > scoreB ? a!.characterId : scoreB > scoreA ? b!.characterId : null;
    return {
      id: matchId,
      a: { playerId: a!.characterId, name: name(a!.characterId), wowClass: cls(a!.characterId) },
      b: { playerId: b!.characterId, name: name(b!.characterId), wowClass: cls(b!.characterId) },
      winnerId,
      scoreA, scoreB,
      bestOf: contract.bestOf, ladder: contract.ladder,
      rulesetName: c.rulesetVersionId, standard: contract.ratedIntent,
      status: m.evidence === "corroborated"
        ? (m.rating === "applied" || m.rating === "pending" ? "rated" : "received")
        : m.evidence === "disputed" ? "under_review"
        : reports.length > 0 ? "awaiting_opponent" : "recorded_locally",
      evidence: m.evidence === "corroborated" ? "corroborated"
        : m.evidence === "disputed" ? "disputed" : "peer_supported",
      games: games.map((g) => ({
        index: g.gameIndex, winnerId: g.winnerCharacterId,
        reason: g.finishReason ?? "unknown", voided: false,
      })),
      reportsReceived: reports.length,
      playedAtMs: m.finishedAt ?? m.firstSeenAt ?? 0,
      receivedAtMs: m.firstSeenAt,
      ratedAtMs: m.rating === "applied" ? m.firstSeenAt : null,
      side: parts.map((p) => ({ side: p.side, characterId: p.characterId })),
    };
  }

  async matchesIndex(limit = 50) {
    const rows = [...this.s.matches.keys()]
      .sort((x, y) => {
        const mx = this.s.matches.get(x)!, my = this.s.matches.get(y)!;
        return (my.firstSeenAt ?? my.finishedAt ?? 0) - (mx.firstSeenAt ?? mx.finishedAt ?? 0);
      })
      .slice(0, limit);
    const out: MatchIndexEntry[] = [];
    for (const id of rows) {
      const s = await this.summarize(id);
      if (s) {
        const { games: _g, side: _s, ratedAtMs: _r, ...card } = s;
        out.push(card);
      }
    }
    return out;
  }

  async matchDetail(matchId: string) {
    return this.summarize(matchId);
  }

  /** The signed-in account's characters — /v1/me; dev names resolve via the
   *  seeded names map like every other read. */
  async myCharacters(accountId: string) {
    return [...this.s.characters.values()]
      .filter((c) => c.accountId === accountId)
      .sort((a, b) => (this.names.get(a.id) ?? a.id)
        .localeCompare(this.names.get(b.id) ?? b.id))
      .map((c) => ({
        id: c.id, name: this.names.get(c.id) ?? c.id.slice(0, 8),
        classId: c.classId, verificationTier: c.verificationTier,
      }));
  }

  /** Rating block for one ladder from the active generation, or null. */
  private ladderBlock(seasonId: string, ladder: "open" | "mirror", characterId: string,
                      classId: number) {
    const member = this.activeMembers(seasonId, ladder).find((m) => {
      if (m.character_id !== characterId) return false;
      if (ladder === "mirror") {
        const lk = JSON.parse(m.ladder_key) as string[];
        return lk[4] === String(classId);
      }
      return true;
    });
    if (!member) return { rating: null, placement: null, wins: 0, losses: 0 };
    const need = ladder === "mirror" ? { series: 6, opponents: 3 } : { series: 10, opponents: 5 };
    const placing = member.positive_series < need.series
      || member.distinct_opponents < need.opponents;
    return {
      rating: placing ? null : Math.round(member.rating_milli / 1000),
      placement: placing ? {
        seriesDone: member.positive_series, seriesNeeded: need.series,
        opponentsDone: member.distinct_opponents, opponentsNeeded: need.opponents,
      } : null,
      wins: 0, losses: 0, // filled from match list below
    };
  }

  async playerDetail(playerId: string) {
    const ch = this.s.characters.get(playerId);
    if (!ch) return null;
    const matchIds: string[] = [];
    for (const [mid, parts] of this.s.participants) {
      if (parts.some((p) => p.characterId === playerId)) matchIds.push(mid);
    }
    const matches: MatchIndexEntry[] = [];
    for (const mid of matchIds) {
      const s = await this.summarize(mid);
      if (s) {
        const { games: _g, side: _s, ratedAtMs: _r, ...card } = s;
        matches.push(card);
      }
    }
    matches.sort((a, b) => (b.playedAtMs || b.receivedAtMs || 0)
      - (a.playedAtMs || a.receivedAtMs || 0));

    // season for rating blocks: from any contract this character appeared in
    const seasonId = matchIds
      .map((id) => this.s.contracts.get(id)?.seasonId)
      .find((x): x is string => !!x) ?? "";
    const open = this.ladderBlock(seasonId, "open", playerId, ch.classId);
    const mirror = this.ladderBlock(seasonId, "mirror", playerId, ch.classId);
    // honest W/L: decided, non-disputed series only
    for (const m of matches) {
      if (m.winnerId === null || m.evidence === "disputed") continue;
      if (m.ladder === "mirror") {
        if (m.winnerId === playerId) mirror.wins++; else mirror.losses++;
      } else {
        if (m.winnerId === playerId) open.wins++; else open.losses++;
      }
    }
    return {
      id: playerId,
      name: this.names.get(playerId) ?? playerId.slice(0, 8),
      wowClass: CLASS_NAMES[ch.classId] ?? "unknown",
      realm: "Forever",
      tier: ch.verificationTier,
      titles: [] as string[],
      open, mirror,
      rivals: computeRivals(playerId, matches),
      lastActiveAtMs: matches[0]?.playedAtMs ?? 0,
      matches,
    };
  }

  async siteStatus() {
    const seasons = [...this.s.heads.entries()].map(([seasonId, h]) => ({
      seasonId, activeGenerationId: h.activeGenerationId,
    }));
    return {
      configVersion: this.configVersion,
      generatedAtMs: Date.now(),
      seasons,
      capabilities: [], // populated from probe results when the lab reports in
      ratingGeneration: null, // api.ts merges the runner's latest() here
    };
  }
}

/**
 * WFU1 bundle source over InMemoryStore (dev/tests). Receipts map match
 * state to the wire status; sequences are per-account monotonic with
 * idempotent replay on idemKey.
 */
export class InMemorySnapshotSource implements SnapshotSource {
  private counters = new Map<string, { seq: number; idem: Map<string, number> }>();
  private receiptIds = new Map<string, string>(); // reportRow id -> stable uuid

  constructor(
    private readonly s: InMemoryStore,
    private readonly reads: InMemoryReadModel,
  ) {}

  async generationForSeason(seasonId: string) {
    return this.s.heads.get(seasonId)?.activeGenerationId ?? null;
  }

  async characterIds(accountId: string) {
    return [...this.s.characters.values()]
      .filter((c) => c.accountId === accountId).map((c) => c.id);
  }

  async ladderRows(accountId: string) {
    const mine = new Set(await this.characterIds(accountId));
    const out: {
      characterId: string; seasonId: string; poolId: string;
      ladder: "open" | "mirror"; ratingMilli: number;
      positiveSeries: number; distinctOpponents: number;
    }[] = [];
    for (const [seasonId, head] of this.s.heads) {
      const gen = head.activeGenerationId
        ? this.s.generations.get(head.activeGenerationId) : undefined;
      if (!gen) continue;
      for (const m of gen.members as MemberRow[]) {
        if (!mine.has(m.character_id)) continue;
        const [, pool, , lad] = JSON.parse(m.ladder_key) as string[];
        out.push({
          characterId: m.character_id, seasonId, poolId: pool!,
          ladder: lad as "open" | "mirror",
          ratingMilli: Number(m.rating_milli),
          positiveSeries: m.positive_series,
          distinctOpponents: m.distinct_opponents,
        });
      }
    }
    return out;
  }

  /** Receipts for every report this account has submitted, oldest first. */
  async receipts(accountId: string): Promise<UpdateReceipt[]> {
    const out: UpdateReceipt[] = [];
    for (const r of this.s.reportIndex.values()) {
      if (r.originAccountId !== accountId) continue;
      let rid = this.receiptIds.get(r.id);
      if (!rid) {
        const n = String(this.receiptIds.size + 1).padStart(12, "0");
        rid = `00000000-0000-4000-8000-${n}`;
        this.receiptIds.set(r.id, rid);
      }
      const m = this.s.matches.get(r.matchId);
      const status: UpdateReceipt["status"] =
        m?.evidence === "corroborated"
          ? (m.rating === "pending" ? "rating_pending" : "corroborated")
          : m?.evidence === "disputed" ? "disputed"
          : m?.evidence === "peer_supported" ? "awaiting_peer"
          : "awaiting_peer";
      out.push({
        installationId: r.installationId, receiptId: rid,
        nonce: r.nonce, bodyDigest: r.bodyDigest, status,
      });
    }
    out.sort((a, b) => a.nonce.localeCompare(b.nonce));
    return out;
  }

  async allocateSequence(accountId: string, idemKey: string) {
    const c = this.counters.get(accountId) ?? { seq: 0, idem: new Map() };
    const hit = c.idem.get(idemKey);
    if (hit !== undefined) return hit; // replay returns the same sequence
    c.seq += 1;
    c.idem.set(idemKey, c.seq);
    this.counters.set(accountId, c);
    return c.seq;
  }

  async rulesets() {
    return this.reads.rulesets();
  }
}
