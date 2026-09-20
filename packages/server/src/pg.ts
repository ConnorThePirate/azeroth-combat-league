/**
 * pg.ts — Postgres bindings: PgStore, PgAuthStore, PgReadModel (docs/14).
 *
 * Mirrors InMemoryStore semantics against supabase/migrations schema:
 * - nonce dedupe via the unique index on (origin_account, installation, nonce)
 * - immutable first_seen_at + monotonic receipt_seq (matches_receipt_seq)
 * - generation commit goes through the trusted commit_rating_generation()
 *   function — revision parity + pair conservation + pointer swap happen
 *   inside one transaction there, never in app code.
 * - device tokens are stored as sha256 digests (installations.credential_digest)
 *
 * UNVERIFIED until run against a live database — schema review only.
 */

import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  CharacterRow, ContractRow, GameRow, MatchRow, ParticipantRow, ReportRow, Store,
} from "./store.js";
import type {
  AddStaffResult, ApiEvent, AuthStore, DeviceCredential, EventBoard, MatchIndexEntry,
  NewEventInput, PairRequest, ReadModel, SessionToken, SignupResult,
  WorldBoard, WorldBoardEntry,
} from "./api.js";
import type { PublishedRuleset, RuleClause, UpdateReceipt } from "@acl/contracts";
import { computeRivals } from "./reads.js";
import type { MemberRow } from "./replay.js";
import type { SnapshotSource } from "./snapshot.js";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------------------------------------------------------------------------
// Store

export class PgStore implements Store {
  constructor(private readonly pool: Pool) {}

  async getContract(id: string): Promise<ContractRow | null> {
    const { rows } = await this.pool.query(
      `select id, contract_hash, canonical, season_id, pool_id, ruleset_version_id,
              rated_intent, ladder, best_of, level_min, level_max
       from match_contracts where id = $1`, [id]);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, contractHash: r.contract_hash, canonical: r.canonical,
      seasonId: r.season_id, poolId: r.pool_id,
      rulesetVersionId: r.ruleset_version_id, ratedIntent: r.rated_intent,
      ladder: r.ladder, bestOf: r.best_of, levelMin: r.level_min, levelMax: r.level_max,
    };
  }

  async getMatch(id: string): Promise<MatchRow | null> {
    const { rows } = await this.pool.query(
      `select id, lifecycle, evidence, rating, first_seen_at, receipt_seq, finished_at
       from matches where id = $1`, [id]);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, lifecycle: r.lifecycle, evidence: r.evidence, rating: r.rating,
      firstSeenAt: r.first_seen_at ? Date.parse(r.first_seen_at) : null,
      receiptSeq: r.receipt_seq === null ? null : Number(r.receipt_seq),
      finishedAt: r.finished_at ? Date.parse(r.finished_at) : null,
    };
  }

  async insertContractWithMatch(contract: ContractRow, participants: ParticipantRow[]): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query(
        `insert into match_contracts
           (id, contract_hash, canonical, season_id, pool_id, ruleset_version_id,
            rated_intent, ladder, best_of, level_min, level_max, accepted_expiry)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() + interval '15 minutes')`,
        [contract.id, contract.contractHash, JSON.stringify(contract.canonical),
         contract.seasonId, contract.poolId, contract.rulesetVersionId,
         contract.ratedIntent, contract.ladder, contract.bestOf,
         contract.levelMin, contract.levelMax]);
      for (const p of participants) {
        await c.query(
          `insert into match_participants (match_id, character_id, account_id_at_match, side)
           values ($1,$2,$3,$4)`,
          [p.matchId, p.characterId, p.accountIdAtMatch, p.side]);
      }
      await c.query(`insert into matches (id) values ($1)`, [contract.id]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }

  async insertReport(r: Omit<ReportRow, "id" | "receivedAt" | "receiptSeq">): Promise<"inserted" | "duplicate" | "conflict"> {
    const { rows } = await this.pool.query(
      `insert into match_reports
         (match_id, origin_character_id, origin_account_id, installation_id,
          nonce, body_digest, body, auth_method)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (origin_account_id, installation_id, nonce) do nothing
       returning id`,
      [r.matchId, r.originCharacterId, r.originAccountId, r.installationId,
       r.nonce, r.bodyDigest, JSON.stringify(r.body), r.authMethod]);
    if (rows.length > 0) return "inserted";
    const { rows: existing } = await this.pool.query(
      `select body_digest from match_reports
       where origin_account_id = $1 and installation_id = $2 and nonce = $3`,
      [r.originAccountId, r.installationId, r.nonce]);
    if (existing.length === 0) return "inserted"; // raced delete — treat as new
    return existing[0]!.body_digest === r.bodyDigest ? "duplicate" : "conflict";
  }

  async reportsForMatch(matchId: string): Promise<ReportRow[]> {
    const { rows } = await this.pool.query(
      `select id, match_id, origin_character_id, origin_account_id, installation_id,
              nonce, body_digest, body, auth_method, received_at, receipt_seq
       from match_reports where match_id = $1 order by received_at`, [matchId]);
    return rows.map((r) => ({
      id: r.id, matchId: r.match_id, originCharacterId: r.origin_character_id,
      originAccountId: r.origin_account_id, installationId: r.installation_id,
      nonce: r.nonce, bodyDigest: r.body_digest, body: r.body,
      authMethod: r.auth_method, receivedAt: Date.parse(r.received_at),
      receiptSeq: r.receipt_seq === null ? null : Number(r.receipt_seq),
    }));
  }

  async participantsOf(matchId: string): Promise<ParticipantRow[]> {
    const { rows } = await this.pool.query(
      `select match_id, character_id, account_id_at_match, side
       from match_participants where match_id = $1`, [matchId]);
    return rows.map((r) => ({
      matchId: r.match_id, characterId: r.character_id,
      accountIdAtMatch: r.account_id_at_match, side: r.side,
    }));
  }

  async getCharacter(id: string): Promise<CharacterRow | null> {
    const { rows } = await this.pool.query(
      `select id, account_id, class_id, level, verification_tier
       from characters where id = $1`, [id]);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, accountId: r.account_id, classId: r.class_id,
      level: r.level, verificationTier: r.verification_tier,
    };
  }

  async assignReceipt(matchId: string, nowMs: number): Promise<number> {
    const { rows } = await this.pool.query(
      `update matches set
         first_seen_at = coalesce(first_seen_at, to_timestamp($2 / 1000.0)),
         receipt_seq = coalesce(receipt_seq, nextval('matches_receipt_seq'))
       where id = $1 returning receipt_seq`, [matchId, nowMs]);
    if (rows.length === 0) throw new Error(`unknown match ${matchId}`);
    return Number(rows[0]!.receipt_seq);
  }

  async setMatchState(matchId: string, patch: Partial<Pick<MatchRow, "lifecycle" | "evidence" | "rating" | "finishedAt">>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (patch.lifecycle !== undefined) add("lifecycle", patch.lifecycle);
    if (patch.evidence !== undefined) add("evidence", patch.evidence);
    if (patch.rating !== undefined) add("rating", patch.rating);
    if (patch.finishedAt !== undefined) {
      vals.push(patch.finishedAt); sets.push(`finished_at = to_timestamp($${vals.length} / 1000.0)`);
    }
    if (sets.length === 0) return;
    vals.push(matchId);
    const { rowCount } = await this.pool.query(
      `update matches set ${sets.join(", ")} where id = $${vals.length}`, vals);
    if (rowCount === 0) throw new Error(`unknown match ${matchId}`);
  }

  async setMatchGames(matchId: string, games: GameRow[]): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query(`delete from match_games where match_id = $1`, [matchId]);
      for (const g of games) {
        await c.query(
          `insert into match_games (match_id, game_index, winner_character_id, finish_reason)
           values ($1,$2,$3,$4)`, [g.matchId, g.gameIndex, g.winnerCharacterId, g.finishReason]);
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }

  async matchGames(matchId: string): Promise<GameRow[]> {
    const { rows } = await this.pool.query(
      `select match_id, game_index, winner_character_id, finish_reason
       from match_games where match_id = $1 order by game_index`, [matchId]);
    return rows.map((r) => ({
      matchId: r.match_id, gameIndex: r.game_index,
      winnerCharacterId: r.winner_character_id, finishReason: r.finish_reason,
    }));
  }

  async matchesForSeason(seasonId: string): Promise<MatchRow[]> {
    const { rows } = await this.pool.query(
      `select m.id, m.lifecycle, m.evidence, m.rating, m.first_seen_at, m.receipt_seq, m.finished_at
       from matches m join match_contracts c on c.id = m.id
       where c.season_id = $1`, [seasonId]);
    return rows.map((r) => ({
      id: r.id, lifecycle: r.lifecycle, evidence: r.evidence, rating: r.rating,
      firstSeenAt: r.first_seen_at ? Date.parse(r.first_seen_at) : null,
      receiptSeq: r.receipt_seq === null ? null : Number(r.receipt_seq),
      finishedAt: r.finished_at ? Date.parse(r.finished_at) : null,
    }));
  }

  async seasonInputRevision(seasonId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `select input_revision from season_projection_heads where season_id = $1`, [seasonId]);
    return rows[0] ? Number(rows[0].input_revision) : 0;
  }

  async bumpInputRevision(seasonId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `insert into season_projection_heads (season_id, input_revision) values ($1, 1)
       on conflict (season_id) do update
         set input_revision = season_projection_heads.input_revision + 1
       returning input_revision`, [seasonId]);
    return Number(rows[0]!.input_revision);
  }

  async commitGeneration(gen: {
    generationId: string; seasonId: string; inputRevision: number;
    ledger: unknown[]; members: unknown[];
  }): Promise<"published" | { status: "stale_revision"; actual: number }> {
    // Register the generation row, then let the trusted function do the
    // revision check + conservation assert + atomic pointer swap.
    await this.pool.query(
      `insert into rating_generations (id, season_id, input_revision, algorithm_version, status)
       values ($1,$2,$3,'community-elo-1','complete')
       on conflict (id) do nothing`, [gen.generationId, gen.seasonId, gen.inputRevision]);
    const { rows } = await this.pool.query(
      `select commit_rating_generation($1,$2,$3,$4,$5) as result`,
      [gen.generationId, gen.seasonId, gen.inputRevision,
       JSON.stringify(gen.ledger), JSON.stringify(gen.members)]);
    const res = rows[0]!.result as { status: string; actual?: number };
    if (res.status === "published") return "published";
    return { status: "stale_revision", actual: Number(res.actual ?? 0) };
  }
}

// ---------------------------------------------------------------------------
// AuthStore — installations + pair_requests (tokens stored as digests)

/**
 * SupabaseSessionValidator — resolves a bearer token to an app SessionToken.
 *
 * The token is a Supabase Auth access token (issued to the site by email or
 * OAuth sign-in). We validate it by calling GoTrue's `GET /auth/v1/user`
 * with the project's anon key; a 200 proves the session is live and yields
 * the `auth.users.id`. That id maps to a platform account via
 * `accounts.auth_user_id` (0007/0012) — first sign-in auto-provisions a
 * profile + account so authenticated routes just work.
 *
 * A small TTL cache keeps Supabase off the hot path: validated sessions
 * cache 60s, rejections 30s. Anything that is not a clean 200 — non-2xx,
 * timeout, DB error — returns null, so failures degrade to 401, never 500.
 */
export class SupabaseSessionValidator {
  /** Env vars the deployment must set for session auth (serve.ts warns). */
  static readonly ENV = { url: "SUPABASE_URL", anonKey: "SUPABASE_ANON_KEY" } as const;
  static readonly HIT_TTL_MS = 60_000;
  static readonly MISS_TTL_MS = 30_000;

  private readonly cache = new Map<string, {
    session: SessionToken | null; untilMs: number;
  }>();

  constructor(
    private readonly pool: Pool,
    private readonly supabaseUrl: string | null,
    private readonly supabaseAnonKey: string | null,
  ) {}

  /** False when SUPABASE_URL/SUPABASE_ANON_KEY are unset — every call null. */
  get configured(): boolean {
    return !!(this.supabaseUrl && this.supabaseAnonKey);
  }

  async getSession(token: string): Promise<SessionToken | null> {
    if (!this.configured) return null;
    const now = Date.now();
    const hit = this.cache.get(token);
    if (hit && hit.untilMs > now) return hit.session;
    // validate() swallows nothing itself; a throw here (network, DB) means
    // "cannot authenticate" — cache the miss briefly so an outage doesn't
    // turn into a per-request timeout.
    const session = await this.validate(token).catch(() => null);
    if (this.cache.size > 512) {
      for (const [k, v] of this.cache) {
        if (v.untilMs <= now) this.cache.delete(k);
      }
    }
    this.cache.set(token, {
      session,
      untilMs: now + (session ? SupabaseSessionValidator.HIT_TTL_MS
        : SupabaseSessionValidator.MISS_TTL_MS),
    });
    return session;
  }

  private async validate(token: string): Promise<SessionToken | null> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: this.supabaseAnonKey!,
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const user = await res.json() as {
      id?: unknown; email?: unknown; user_metadata?: unknown;
    };
    if (typeof user.id !== "string" || !user.id) return null;
    const accountId = await this.accountFor({
      id: user.id,
      email: typeof user.email === "string" ? user.email : undefined,
      metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
    });
    return accountId
      ? { token, accountId, issuedAtMs: Date.now() }
      : null;
  }

  /** The auth user's platform account, provisioning one on first sign-in. */
  private async accountFor(user: {
    id: string; email?: string | undefined; metadata: Record<string, unknown>;
  }): Promise<string | null> {
    const { rows } = await this.pool.query(
      `select id from accounts where auth_user_id = $1`, [user.id]);
    if (rows[0]) return rows[0].id as string;
    return this.provision(user);
  }

  /**
   * First sign-in: insert a profile (public_slug from the user's display
   * name or email prefix) + an account linked by auth_user_id. A concurrent
   * first sign-in can win the unique(auth_user_id) race — then we just read
   * their row. Slug collisions retry with -2/-3 suffixes, then fall back to
   * `player-<8 hex>` derived from the auth user id.
   */
  private async provision(user: {
    id: string; email?: string | undefined; metadata: Record<string, unknown>;
  }): Promise<string | null> {
    const base = SupabaseSessionValidator.slugBase(user);
    const fallback = `player-${user.id.replace(/-/g, "").slice(0, 8)}`;
    const candidates = [...new Set([base, `${base}-2`, `${base}-3`, fallback])];
    for (const slug of candidates) {
      try {
        const { rows: prof } = await this.pool.query(
          `insert into profiles (public_slug) values ($1) returning id`, [slug]);
        const { rows: acct } = await this.pool.query(
          `insert into accounts (profile_id, auth_user_id) values ($1, $2)
           on conflict (auth_user_id) do nothing returning id`,
          [prof[0]!.id, user.id]);
        if (acct[0]) return acct[0].id as string;
        // lost the provisioning race — the winner's account exists now
        const { rows: won } = await this.pool.query(
          `select id from accounts where auth_user_id = $1`, [user.id]);
        return (won[0]?.id as string) ?? null;
      } catch (e) {
        // 23505 unique_violation on profiles.public_slug — try the next slug
        if ((e as { code?: string }).code === "23505") continue;
        throw e;
      }
    }
    return null;
  }

  /** Display-name-ish slug: user_metadata.name / full_name / email prefix. */
  private static slugBase(user: {
    id: string; email?: string | undefined; metadata: Record<string, unknown>;
  }): string {
    const meta = user.metadata;
    const raw =
      (typeof meta.name === "string" && meta.name) ||
      (typeof meta.full_name === "string" && meta.full_name) ||
      (user.email?.split("@")[0] ?? "");
    const slug = raw.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    return slug || `player-${user.id.replace(/-/g, "").slice(0, 8)}`;
  }
}

export class PgAuthStore implements AuthStore {
  /** Env vars session validation reads — see SupabaseSessionValidator.ENV. */
  static readonly ENV = SupabaseSessionValidator.ENV;
  private readonly sessions: SupabaseSessionValidator;

  constructor(private readonly pool: Pool, env: NodeJS.ProcessEnv = process.env) {
    const url = env[PgAuthStore.ENV.url]?.replace(/\/+$/, "") || null;
    const key = env[PgAuthStore.ENV.anonKey] || null;
    this.sessions = new SupabaseSessionValidator(pool, url, key);
  }

  /** True when SUPABASE_URL + SUPABASE_ANON_KEY are set (serve.ts wiring). */
  get supabaseAuthConfigured(): boolean {
    return this.sessions.configured;
  }

  async savePair(r: PairRequest): Promise<void> {
    await this.pool.query(
      `insert into pair_requests (device_code, user_code, installation_id, expires_at)
       values ($1,$2,$3,to_timestamp($4 / 1000.0))`,
      [r.deviceCode, r.userCode, r.installationId, r.expiresAtMs]);
  }

  async getPair(deviceCode: string): Promise<PairRequest | null> {
    const { rows } = await this.pool.query(
      `select device_code, user_code, installation_id, approved_account_id,
              expires_at, consumed_at
       from pair_requests where device_code = $1`, [deviceCode]);
    const r = rows[0];
    if (!r) return null;
    return {
      deviceCode: r.device_code, userCode: r.user_code,
      installationId: r.installation_id, expiresAtMs: Date.parse(r.expires_at),
      approvedAccountId: r.approved_account_id,
      consumedAtMs: r.consumed_at ? Date.parse(r.consumed_at) : null,
    };
  }

  async getPairByUserCode(userCode: string): Promise<PairRequest | null> {
    const { rows } = await this.pool.query(
      `select device_code, user_code, installation_id, approved_account_id,
              expires_at, consumed_at
       from pair_requests where user_code = $1`, [userCode]);
    const r = rows[0];
    if (!r) return null;
    return {
      deviceCode: r.device_code, userCode: r.user_code,
      installationId: r.installation_id, expiresAtMs: Date.parse(r.expires_at),
      approvedAccountId: r.approved_account_id,
      consumedAtMs: r.consumed_at ? Date.parse(r.consumed_at) : null,
    };
  }

  async approvePair(deviceCode: string, accountId: string): Promise<boolean> {
    // single-use: only an unapproved, unconsumed, unexpired row flips
    const { rowCount } = await this.pool.query(
      `update pair_requests set approved_account_id = $2
       where device_code = $1 and approved_account_id is null
         and consumed_at is null and expires_at > now()`,
      [deviceCode, accountId]);
    return (rowCount ?? 0) > 0;
  }

  async consumePair(deviceCode: string): Promise<void> {
    await this.pool.query(
      `update pair_requests set consumed_at = now() where device_code = $1`,
      [deviceCode]);
  }

  async saveDevice(c: DeviceCredential): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      // installations row is born at approval time, bound to the account
      await client.query(
        `insert into installations (id, account_id, credential_digest, label)
         values ($1,$2,$3,'companion')
         on conflict (id) do update
           set account_id = $2, credential_digest = $3, revoked_at = null`,
        [c.installationId, c.accountId, digest(c.token)]);
      await client.query(
        `update pair_requests set consumed_at = now()
         where installation_id = $1 and consumed_at is null`, [c.installationId]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  async getDevice(token: string): Promise<DeviceCredential | null> {
    const { rows } = await this.pool.query(
      `select id, account_id, created_at, revoked_at
       from installations where credential_digest = $1`, [digest(token)]);
    const r = rows[0];
    if (!r) return null;
    return {
      token, accountId: r.account_id, installationId: r.id,
      issuedAtMs: Date.parse(r.created_at), revoked: r.revoked_at !== null,
    };
  }

  async revokeDevice(token: string): Promise<void> {
    await this.pool.query(
      `update installations set revoked_at = now() where credential_digest = $1`,
      [digest(token)]);
  }

  // Sessions are owned by Supabase Auth — issued/refreshed/revoked there —
  // so there is nothing to persist here; getSession only validates.
  async saveSession(_s: SessionToken): Promise<void> { /* Supabase Auth owns sessions */ }
  async getSession(t: string): Promise<SessionToken | null> {
    return this.sessions.getSession(t);
  }
}

// ---------------------------------------------------------------------------
// ReadModel — published generations only

export class PgReadModel implements ReadModel {
  constructor(private readonly pool: Pool) {}

  private async activeGeneration(seasonId: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      `select active_generation_id from season_projection_heads where season_id = $1`,
      [seasonId]);
    return rows[0]?.active_generation_id ?? null;
  }

  async leaderboard(seasonId: string, ladder: "open" | "mirror") {
    const gen = await this.activeGeneration(seasonId);
    if (!gen) return [];
    // W/L mirrors playerDetail: finished, non-disputed, decided series —
    // the character's game wins strictly more than the opponent's. A null
    // contract ladder counts toward open, same as playerDetail's split.
    const { rows } = await this.pool.query(
      `select m.character_id, m.rating_milli, m.positive_series, m.distinct_opponents,
              c.name, c.class_id, c.verification_tier,
              wl.wins, wl.losses
       from ladder_members m
       join characters c on c.id = m.character_id
       left join lateral (
         select count(*) filter (where t.my_wins > t.op_wins) as wins,
                count(*) filter (where t.my_wins < t.op_wins) as losses
         from (
           select (select count(*) from match_games g
                     where g.match_id = p.match_id
                       and g.winner_character_id = p.character_id) as my_wins,
                  (select count(*) from match_games g
                     where g.match_id = p.match_id
                       and g.winner_character_id <> p.character_id) as op_wins
           from match_participants p
           join matches mm on mm.id = p.match_id
           join match_contracts cc on cc.id = p.match_id
           where p.character_id = m.character_id
             and mm.lifecycle = 'finished'
             and mm.evidence <> 'disputed'
             and coalesce(cc.ladder, 'open') = $3
         ) t
       ) wl on true
       where m.generation_id = $1
         and m.ladder_key->>0 = $2 and m.ladder_key->>3 = $3`, [gen, seasonId, ladder]);
    const need = ladder === "mirror" ? { series: 6, opponents: 3 } : { series: 10, opponents: 5 };
    const cls: Record<number, string> = {
      1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
      6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
    };
    const rows2 = rows.map((r) => ({
      r, placing: r.positive_series < need.series || r.distinct_opponents < need.opponents,
    }));
    // rated first by rating (ties: wins then name); placing by progress —
    // placing rows never consume a rated rank slot
    const rated = rows2.filter((x) => !x.placing).sort((a, b) =>
      Number(b.r.rating_milli) - Number(a.r.rating_milli)
      || Number(b.r.wins) - Number(a.r.wins)
      || String(a.r.name).localeCompare(String(b.r.name)));
    const placing = rows2.filter((x) => x.placing).sort((a, b) =>
      b.r.positive_series - a.r.positive_series
      || b.r.distinct_opponents - a.r.distinct_opponents
      || String(a.r.name).localeCompare(String(b.r.name)));
    return [...rated, ...placing].map((x, i) => {
      const r = x.r;
      return {
        rank: i + 1, playerId: r.character_id, name: r.name,
        wowClass: cls[r.class_id as number] ?? "unknown",
        rating: x.placing ? 0 : Math.round(Number(r.rating_milli) / 1000),
        wins: Number(r.wins), losses: Number(r.losses),
        placement: x.placing ? {
          seriesDone: r.positive_series, seriesNeeded: need.series,
          opponentsDone: r.distinct_opponents, opponentsNeeded: need.opponents,
        } : null,
        tier: r.verification_tier,
      };
    });
  }

  private async matchIndexRows(where: string, params: unknown[], limit: number): Promise<MatchIndexEntry[]> {
    const { rows } = await this.pool.query(
      `select m.id, m.lifecycle, m.evidence, m.rating, m.first_seen_at, m.finished_at,
              c.canonical, c.ruleset_version_id,
              (select count(*) from match_reports r where r.match_id = m.id) as reports_received,
              (select json_agg(json_build_object(
                 'characterId', p.character_id, 'side', p.side,
                 'name', ch.name, 'classId', ch.class_id) order by p.side)
               from match_participants p join characters ch on ch.id = p.character_id
               where p.match_id = m.id) as participants,
              (select json_agg(g.winner_character_id order by g.game_index)
               from match_games g where g.match_id = m.id) as winners
       from matches m join match_contracts c on c.id = m.id
       where ${where}
       order by coalesce(m.first_seen_at, m.finished_at) desc nulls last
       limit ${Number(limit) | 0}`, params);
    const cls: Record<number, string> = {
      1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
      6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
    };
    const out: MatchIndexEntry[] = [];
    for (const r of rows) {
      const contract = r.canonical as { participants: { characterId: string; side: number }[];
        bestOf: number; ladder: string | null; ratedIntent: boolean };
      const parts = (r.participants ?? []) as {
        characterId: string; side: number; name: string; classId: number }[];
      const winners = (r.winners ?? []) as (string | null)[];
      const [a, b] = contract.participants;
      if (!a || !b) continue; // malformed canonical — never persisted, but guard anyway
      const pa = parts.find((p) => p.characterId === a.characterId);
      const pb = parts.find((p) => p.characterId === b.characterId);
      const score = (cid: string) => winners.filter((w) => w === cid).length;
      const scoreA = score(a.characterId), scoreB = score(b.characterId);
      const reportsReceived = Number(r.reports_received);
      out.push({
        id: r.id,
        a: { playerId: a.characterId, name: pa?.name ?? a.characterId.slice(0, 8),
             wowClass: cls[pa?.classId ?? 0] ?? "unknown" },
        b: { playerId: b.characterId, name: pb?.name ?? b.characterId.slice(0, 8),
             wowClass: cls[pb?.classId ?? 0] ?? "unknown" },
        winnerId: scoreA > scoreB ? a.characterId : scoreB > scoreA ? b.characterId : null,
        scoreA, scoreB, bestOf: contract.bestOf,
        ladder: contract.ladder,
        rulesetName: r.ruleset_version_id,
        standard: contract.ratedIntent,
        status: r.evidence === "corroborated"
          ? (r.rating === "applied" || r.rating === "pending" ? "rated" : "received")
          : r.evidence === "disputed" ? "under_review"
          : reportsReceived > 0 ? "awaiting_opponent" : "recorded_locally",
        evidence: r.evidence === "corroborated" ? "corroborated"
          : r.evidence === "disputed" ? "disputed" : "peer_supported",
        reportsReceived,
        playedAtMs: r.finished_at ? Date.parse(r.finished_at)
          : r.first_seen_at ? Date.parse(r.first_seen_at) : 0,
        receivedAtMs: r.first_seen_at ? Date.parse(r.first_seen_at) : null,
      });
    }
    return out;
  }

  async matchesIndex(limit = 50): Promise<MatchIndexEntry[]> {
    return this.matchIndexRows("true", [], limit);
  }

  /** The signed-in account's own characters — /v1/me. */
  async myCharacters(accountId: string) {
    const { rows } = await this.pool.query(
      `select id, name, class_id, verification_tier
       from characters where account_id = $1 order by created_at, name`, [accountId]);
    return rows.map((r) => ({
      id: r.id as string, name: r.name as string,
      classId: r.class_id as number,
      verificationTier: r.verification_tier as string,
    }));
  }

  async matchDetail(matchId: string) {
    const { rows } = await this.pool.query(
      `select m.lifecycle, m.evidence, m.rating, m.first_seen_at, m.finished_at,
              c.canonical, c.ruleset_version_id, c.best_of, c.ladder, c.rated_intent,
              (select count(*) from match_reports r where r.match_id = m.id) as reports_received
       from matches m join match_contracts c on c.id = m.id where m.id = $1`, [matchId]);
    const m = rows[0];
    if (!m) return null;
    const { rows: games } = await this.pool.query(
      `select game_index, winner_character_id, finish_reason
       from match_games where match_id = $1 order by game_index`, [matchId]);
    const contract = m.canonical as { participants: { characterId: string; side: number }[] };
    return {
      id: matchId, lifecycle: m.lifecycle, evidence: m.evidence, rating: m.rating,
      reportsReceived: Number(m.reports_received),
      participants: contract.participants, bestOf: m.best_of, ladder: m.ladder,
      games: games.map((g) => ({
        index: g.game_index, winnerId: g.winner_character_id, reason: g.finish_reason,
      })),
      playedAtMs: m.finished_at ? Date.parse(m.finished_at) : null,
      receivedAtMs: m.first_seen_at ? Date.parse(m.first_seen_at) : null,
    };
  }

  /** Rating block for one ladder from the active generation, or empty. */
  private async ladderBlock(ladder: "open" | "mirror", characterId: string, classId: number) {
    const { rows } = await this.pool.query(
      `select m.rating_milli, m.positive_series, m.distinct_opponents
       from ladder_members m
       join season_projection_heads h on h.active_generation_id = m.generation_id
       where m.character_id = $1
         and m.ladder_key->>3 = $2
         and ($2 = 'open' or m.ladder_key->>4 = $3)
       limit 1`,
      [characterId, ladder, String(classId)]);
    const m = rows[0];
    if (!m) return { rating: null, placement: null, wins: 0, losses: 0 };
    const need = ladder === "mirror" ? { series: 6, opponents: 3 } : { series: 10, opponents: 5 };
    const placing = m.positive_series < need.series || m.distinct_opponents < need.opponents;
    return {
      rating: placing ? null : Math.round(Number(m.rating_milli) / 1000),
      placement: placing ? {
        seriesDone: m.positive_series, seriesNeeded: need.series,
        opponentsDone: m.distinct_opponents, opponentsNeeded: need.opponents,
      } : null,
      wins: 0, losses: 0,
    };
  }

  async playerDetail(playerId: string) {
    const { rows } = await this.pool.query(
      `select id, name, class_id, verification_tier from characters where id = $1`, [playerId]);
    const r = rows[0];
    if (!r) return null;
    const matches = await this.matchIndexRows(
      `m.id in (select match_id from match_participants where character_id = $1)`,
      [playerId], 100);
    const cls: Record<number, string> = {
      1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
      6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
    };
    const open = await this.ladderBlock("open", playerId, r.class_id);
    const mirror = await this.ladderBlock("mirror", playerId, r.class_id);
    for (const m of matches) {
      if (m.winnerId === null || m.evidence === "disputed") continue;
      const blk = m.ladder === "mirror" ? mirror : open;
      if (m.winnerId === playerId) blk.wins++; else blk.losses++;
    }
    return {
      id: r.id, name: r.name, wowClass: cls[r.class_id as number] ?? "unknown",
      realm: "Forever", tier: r.verification_tier, titles: [] as string[],
      open, mirror,
      rivals: computeRivals(playerId, matches),
      lastActiveAtMs: matches[0]?.playedAtMs ?? 0,
      matches,
    };
  }

  /** Newest published version per ruleset; `content` carries name/desc/rules. */
  async rulesets() {
    const { rows } = await this.pool.query(
      `select distinct on (ruleset_id)
              id, ruleset_id, version, is_standard, content, published_at
       from ruleset_versions
       order by ruleset_id, version desc`, []);
    return rows.map((r): PublishedRuleset & { publishedAtMs: number } => {
      const c = r.content as { name?: string; description?: string; rules?: RuleClause[] };
      return {
        rulesetId: r.ruleset_id, versionId: r.id,
        version: r.version,
        name: c.name ?? "ruleset", description: c.description ?? "",
        standard: r.is_standard,
        rules: c.rules ?? [],
        publishedAtMs: Date.parse(r.published_at),
      };
    }).sort((a, b) =>
      (b.standard ? 1 : 0) - (a.standard ? 1 : 0) || a.name.localeCompare(b.name));
  }

  async siteStatus() {
    const { rows: caps } = await this.pool.query(
      `select capability, build, status, coverage_gaps
       from capability_tests order by tested_at desc nulls last`, []);
    const { rows: heads } = await this.pool.query(
      `select season_id, active_generation_id from season_projection_heads`, []);
    return {
      configVersion: "beta-v2", generatedAtMs: Date.now(),
      capabilities: caps.map((c) => ({
        id: c.capability, label: c.capability, status: c.status, note: c.coverage_gaps,
      })),
      seasons: heads.map((h) => ({
        seasonId: h.season_id, activeGenerationId: h.active_generation_id,
      })),
      ratingGeneration: null, // api.ts merges the runner's latest() here
    };
  }
}

// ---------------------------------------------------------------------------
// EventBoard — tournaments + registrations (0005/0010)

export class PgEventBoard implements EventBoard {
  constructor(private readonly pool: Pool) {}

  async list(accountId?: string | null) {
    const { rows } = await this.pool.query(
      `select t.id, t.name, t.kind, t.venue, t.cap, t.description, t.status,
              t.starts_at,
              ${accountId
                ? `(t.organizer_id = (select profile_id from accounts
                     where id = $1)) as managed_by_me`
                : `false as managed_by_me`},
              (select count(*) from registrations r
                where r.event_id = t.id and r.status <> 'dropped') as signups,
              (select coalesce(jsonb_agg(jsonb_build_object(
                 'name', coalesce(ch.name, p.public_slug),
                 'role', s.role,
                 'playerId', ch.id,
                 'classId', ch.class_id) order by s.role, ch.name),
                 '[]'::jsonb)
               from event_staff s
               join profiles p on p.id = s.profile_id
               left join accounts a on a.profile_id = p.id
               -- display character: the one they're registered for this
               -- event with, else their best-verified/highest-level char
               left join lateral (
                 select c.id, c.name, c.class_id
                 from characters c
                 left join registrations r
                   on r.character_id = c.id and r.event_id = s.event_id
                    and r.status <> 'dropped'
                 where c.account_id = a.id
                 order by (r.id is not null) desc,
                   case c.verification_tier
                     when 'provider_verified' then 0
                     when 'witnessed' then 1 else 2 end,
                   c.level desc, c.name
                 limit 1
               ) ch on true
               where s.event_id = t.id) as staff,
              ${accountId
                ? `(select exists(select 1 from registrations r
                    where r.event_id = t.id and r.account_id = $1
                      and r.status <> 'dropped')) as registered`
                : `false as registered`}
       from tournaments t
       where t.visibility = 'public' and t.status <> 'cancelled'
       order by t.starts_at nulls last`,
      accountId ? [accountId] : []);
    const statusMap: Record<string, ApiEvent["status"]> = {
      registration: "upcoming", check_in: "upcoming", seeded: "upcoming",
      published: "upcoming", draft: "upcoming",
      active: "live", review: "live",
      complete: "done", cancelled: "done",
    };
    const cls: Record<number, string> = {
      1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
      6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
    };
    return rows.map((r) => ({
      id: r.id, name: r.name,
      kind: r.kind as ApiEvent["kind"],
      whenMs: r.starts_at ? Date.parse(r.starts_at) : 0,
      venue: r.venue, status: statusMap[r.status as string] ?? "upcoming",
      description: r.description,
      signups: Number(r.signups), cap: r.cap,
      registered: !!r.registered,
      managedByMe: !!r.managed_by_me,
      staff: ((r.staff ?? []) as {
        name: string; role: "organizer" | "referee";
        playerId?: string; classId?: number;
      }[]).map((s) => ({
        name: s.name, role: s.role,
        ...(s.playerId ? { playerId: s.playerId } : {}),
        ...(s.classId ? { wowClass: cls[s.classId] ?? "unknown" } : {}),
      })),
    }));
  }

  async signup(eventId: string, accountId: string, characterId: string | null): Promise<SignupResult> {
    const { rows } = await this.pool.query(
      `select status, cap, (select count(*) from registrations r
         where r.event_id = $1 and r.status <> 'dropped') as n
       from tournaments where id = $1 and visibility = 'public'`, [eventId]);
    const ev = rows[0];
    if (!ev || ["complete", "cancelled", "review"].includes(ev.status as string)) return "closed";
    if (Number(ev.n) >= Number(ev.cap)) return "full";

    let charId = characterId;
    if (charId) {
      const { rows: ch } = await this.pool.query(
        `select 1 from characters where id = $1 and account_id = $2`, [charId, accountId]);
      if (ch.length === 0) return "no_character";
    } else {
      const { rows: ch } = await this.pool.query(
        `select id from characters where account_id = $1
         order by case verification_tier
           when 'provider_verified' then 0 when 'witnessed' then 1 else 2 end
         limit 1`, [accountId]);
      charId = ch[0]?.id ?? null;
    }
    if (!charId) return "no_character";

    try {
      await this.pool.query(
        `insert into registrations (event_id, character_id, account_id)
         values ($1,$2,$3)`, [eventId, charId, accountId]);
      return "ok";
    } catch (e) {
      // unique(event_id, account_id) — already registered
      if ((e as { code?: string }).code === "23505") return "duplicate";
      throw e;
    }
  }

  async create(input: NewEventInput, organizerAccountId: string): Promise<ApiEvent> {
    // organizer_id is a profile; resolve the caller's account -> profile
    const { rows: acct } = await this.pool.query(
      `select profile_id from accounts where id = $1`, [organizerAccountId]);
    const profileId = acct[0]?.profile_id as string | undefined;
    if (!profileId) throw new Error("account has no profile");
    const { rows } = await this.pool.query(
      `insert into tournaments (organizer_id, name, kind, venue, cap, description,
         visibility, status, starts_at)
       values ($1,$2,$3,$4,$5,$6,'public','published', to_timestamp($7 / 1000.0))
       returning id`,
      [profileId, input.name, input.kind, input.venue, input.cap,
       input.description, input.whenMs]);
    const id = rows[0]!.id as string;
    // the organizer is staff by construction
    await this.pool.query(
      `insert into event_staff (event_id, profile_id, role) values ($1,$2,'organizer')
       on conflict do nothing`, [id, profileId]);
    return {
      id, ...input, status: "upcoming", signups: 0,
      organizerAccountId,
    };
  }

  async addStaff(eventId: string, actorAccountId: string, staffAccountId: string,
    role: "organizer" | "referee"): Promise<AddStaffResult> {
    const { rows: ev } = await this.pool.query(
      `select organizer_id from tournaments where id = $1`, [eventId]);
    if (ev.length === 0) return "no_event";
    const { rows: actor } = await this.pool.query(
      `select profile_id from accounts where id = $1`, [actorAccountId]);
    if (actor[0]?.profile_id !== ev[0]!.organizer_id) return "not_organizer";
    const { rows: staff } = await this.pool.query(
      `select a.profile_id, (select count(*) from characters c where c.account_id = a.id) as n
       from accounts a where a.id = $1`, [staffAccountId]);
    if (!staff[0]?.profile_id) return "no_character";
    if (Number(staff[0].n) === 0) return "no_character";
    await this.pool.query(
      `insert into event_staff (event_id, profile_id, role) values ($1,$2,$3)
       on conflict do nothing`, [eventId, staff[0].profile_id, role]);
    return "ok";
  }
}

// ---------------------------------------------------------------------------
// WorldBoard — opt-in war/pit score ledger (0005 world tables, docs/10).
// Journal-only until client probes green-light scoring.
export class PgWorldBoard implements WorldBoard {
  constructor(private readonly pool: Pool) {}

  async list(seasonId: string) {
    const cls: Record<number, string> = {
      1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
      6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
    };
    const { rows: flags } = await this.pool.query(
      `select enabled from feature_flags where flag = 'world_score'`);
    const { rows } = await this.pool.query(
      `select l.domain, l.points, ch.id as player_id, ch.name, ch.class_id
       from score_ledger l
       join characters ch on ch.account_id = l.account_id
       where l.season_id = $1
       order by l.domain, l.points desc`, [seasonId]);
    const board = (domain: "war" | "pit"): WorldBoardEntry[] =>
      rows.filter((r) => r.domain === domain).map((r, i) => ({
        rank: i + 1, playerId: r.player_id as string, name: r.name as string,
        wowClass: cls[r.class_id as number] ?? "unknown",
        points: Number(r.points), reports: 0,
      }));
    return {
      war: board("war"), pit: board("pit"),
      scoringLive: !!flags[0]?.enabled,
    };
  }
}

// ---------------------------------------------------------------------------
// SnapshotSource — WFU1 bundle source over Postgres (docs/06, 14)

export class PgSnapshotSource implements SnapshotSource {
  constructor(private readonly pool: Pool) {}

  async generationForSeason(seasonId: string) {
    const { rows } = await this.pool.query(
      `select active_generation_id from season_projection_heads where season_id = $1`,
      [seasonId]);
    return rows[0]?.active_generation_id ?? null;
  }

  async characterIds(accountId: string) {
    const { rows } = await this.pool.query(
      `select id from characters where account_id = $1`, [accountId]);
    return rows.map((r) => r.id as string);
  }

  async ladderRows(accountId: string) {
    const { rows } = await this.pool.query(
      `select m.character_id, m.rating_milli, m.positive_series, m.distinct_opponents,
              m.ladder_key
       from ladder_members m
       join characters c on c.id = m.character_id
       join season_projection_heads h on h.active_generation_id = m.generation_id
       where c.account_id = $1`, [accountId]);
    return rows.map((r) => {
      const lk = r.ladder_key as string[];
      return {
        characterId: r.character_id as string,
        seasonId: lk[0]!, poolId: lk[1]!,
        ladder: lk[3] as "open" | "mirror",
        ratingMilli: Number(r.rating_milli),
        positiveSeries: r.positive_series as number,
        distinctOpponents: r.distinct_opponents as number,
      };
    });
  }

  /** All reports this account submitted, oldest first; status from match state. */
  async receipts(accountId: string): Promise<UpdateReceipt[]> {
    const { rows } = await this.pool.query(
      `select r.id, r.installation_id, r.nonce, r.body_digest,
              m.evidence, m.rating
       from match_reports r join matches m on m.id = r.match_id
       where r.origin_account_id = $1
       order by r.received_at`, [accountId]);
    return rows.map((r) => ({
      installationId: r.installation_id, receiptId: r.id,
      nonce: r.nonce, bodyDigest: r.body_digest,
      status: r.evidence === "corroborated"
        ? (r.rating === "pending" ? "rating_pending" : "corroborated")
        : r.evidence === "disputed" ? "disputed" : "awaiting_peer",
    }));
  }

  /** Per-account monotonic sequence via addon_snapshot_counters (0001). */
  async allocateSequence(accountId: string, idemKey: string) {
    void idemKey; // idempotency lives in the caller's retry — seq is monotone
    const { rows } = await this.pool.query(
      `insert into addon_snapshot_counters (account_id, last_sequence)
       values ($1, 1)
       on conflict (account_id)
       do update set last_sequence = addon_snapshot_counters.last_sequence + 1
       returning last_sequence`, [accountId]);
    return Number(rows[0]!.last_sequence);
  }

  async rulesets() {
    const { rows } = await this.pool.query(
      `select distinct on (ruleset_id)
              id, ruleset_id, version, is_standard, content
       from ruleset_versions
       order by ruleset_id, version desc`, []);
    return rows.map((r): PublishedRuleset => {
      const c = r.content as { name?: string; description?: string; rules?: RuleClause[] };
      return {
        rulesetId: r.ruleset_id, versionId: r.id, version: r.version,
        name: c.name ?? "ruleset", description: c.description ?? "",
        standard: r.is_standard, rules: c.rules ?? [],
      };
    });
  }
}
