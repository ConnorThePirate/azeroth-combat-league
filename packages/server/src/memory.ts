/**
 * In-memory Store implementation for tests and local development. Mirrors
 * the Postgres invariants: unique nonce per (account, installation), insert-
 * on-conflict dedupe, monotonic receipt sequence, atomic revision-checked
 * generation commit.
 */

import type {
  CharacterRow, ContractRow, GameRow, MatchRow, ParticipantRow, ReportRow, Store,
} from "./store.js";

let reportIdCounter = 0;

export class InMemoryStore implements Store {
  contracts = new Map<string, ContractRow>();
  matches = new Map<string, MatchRow>();
  participants = new Map<string, ParticipantRow[]>();
  reports = new Map<string, ReportRow[]>();
  reportIndex = new Map<string, ReportRow>(); // account|installation|nonce
  characters = new Map<string, CharacterRow>();
  games = new Map<string, GameRow[]>();
  revisions = new Map<string, number>();
  generations = new Map<string, { seasonId: string; inputRevision: number; ledger: unknown[]; members: unknown[]; published: boolean }>();
  heads = new Map<string, { activeGenerationId: string | null; inputRevision: number }>();
  private receiptSeq = 0;

  async getContract(id: string) { return this.contracts.get(id) ?? null; }
  async getMatch(id: string) { return this.matches.get(id) ?? null; }
  async participantsOf(matchId: string) { return this.participants.get(matchId) ?? []; }
  async getCharacter(id: string) { return this.characters.get(id) ?? null; }
  async seasonInputRevision(seasonId: string) { return this.revisions.get(seasonId) ?? 0; }

  async insertContractWithMatch(contract: ContractRow, participants: ParticipantRow[]): Promise<void> {
    this.contracts.set(contract.id, contract);
    this.participants.set(contract.id, participants);
    this.matches.set(contract.id, {
      id: contract.id, lifecycle: "proposed", evidence: "awaiting",
      rating: "ineligible", firstSeenAt: null, receiptSeq: null, finishedAt: null,
    });
  }

  async insertReport(r: Omit<ReportRow, "id" | "receivedAt" | "receiptSeq">): Promise<"inserted" | "duplicate" | "conflict"> {
    const key = `${r.originAccountId}|${r.installationId}|${r.nonce}`;
    const existing = this.reportIndex.get(key);
    if (existing) {
      return existing.bodyDigest === r.bodyDigest ? "duplicate" : "conflict";
    }
    const row: ReportRow = {
      ...r, id: `report-${++reportIdCounter}`, receivedAt: Date.now(), receiptSeq: null,
    };
    this.reportIndex.set(key, row);
    const list = this.reports.get(r.matchId) ?? [];
    list.push(row);
    this.reports.set(r.matchId, list);
    return "inserted";
  }

  async reportsForMatch(matchId: string) { return this.reports.get(matchId) ?? []; }

  async assignReceipt(matchId: string, nowMs: number): Promise<number> {
    const m = this.matches.get(matchId);
    if (!m) throw new Error(`unknown match ${matchId}`);
    if (m.receiptSeq === null) {
      m.firstSeenAt = nowMs;
      m.receiptSeq = ++this.receiptSeq;
    }
    return m.receiptSeq;
  }

  async setMatchState(matchId: string, patch: Partial<Pick<MatchRow, "lifecycle" | "evidence" | "rating" | "finishedAt">>): Promise<void> {
    const m = this.matches.get(matchId);
    if (!m) throw new Error(`unknown match ${matchId}`);
    Object.assign(m, patch);
  }

  async setMatchGames(matchId: string, games: GameRow[]): Promise<void> {
    this.games.set(matchId, games);
  }
  async matchGames(matchId: string) { return this.games.get(matchId) ?? []; }
  async matchesForSeason(seasonId: string) {
    const out: MatchRow[] = [];
    for (const [id, c] of this.contracts) {
      if (c.seasonId === seasonId) {
        const m = this.matches.get(id);
        if (m) out.push(m);
      }
    }
    return out;
  }

  async bumpInputRevision(seasonId: string): Promise<number> {
    const v = (this.revisions.get(seasonId) ?? 0) + 1;
    this.revisions.set(seasonId, v);
    return v;
  }

  async commitGeneration(gen: {
    generationId: string; seasonId: string; inputRevision: number; ledger: unknown[]; members: unknown[];
  }): Promise<"published" | { status: "stale_revision"; actual: number }> {
    const head = this.heads.get(gen.seasonId) ?? { activeGenerationId: null, inputRevision: 0 };
    // revision parity check — mirrors commit_rating_generation()
    const rev = this.revisions.get(gen.seasonId) ?? 0;
    if (rev !== gen.inputRevision) return { status: "stale_revision", actual: rev };
    this.generations.set(gen.generationId, { ...gen, published: true });
    head.activeGenerationId = gen.generationId;
    this.heads.set(gen.seasonId, head);
    return "published";
  }
}
