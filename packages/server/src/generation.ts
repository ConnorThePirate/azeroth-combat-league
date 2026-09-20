/**
 * generation.ts — debounced, per-season serialized rating generation.
 *
 * Ingest schedules rebuilds; bursts coalesce into one build. Builds are
 * serialized per season: at most one in flight plus one queued follow-up.
 * `latest()` exposes the last published generation for /v1/status.
 */
import { randomUUID } from "node:crypto";
import { buildGeneration } from "./replay.js";
import type { Store } from "./store.js";

export interface GenerationResult {
  status: string;
  events: number;
  generationId: string | null;
}

export interface GenerationInfo {
  generationId: string;
  computedAtMs: number;
  inputRevision: number;
  events: number;
}

export class GenerationRunner {
  private readonly debounceMs: number;
  private readonly now: () => number;
  private readonly idGen: () => string;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, Promise<GenerationResult>>();
  private readonly queued = new Map<string, Promise<GenerationResult>>();
  private readonly published = new Map<string, GenerationInfo>();

  constructor(
    private readonly store: Store,
    opts?: {
      debounceMs?: number;
      now?: () => number;
      idGen?: () => string;
    },
  ) {
    this.debounceMs = opts?.debounceMs ?? 1500;
    this.now = opts?.now ?? (() => Date.now());
    this.idGen = opts?.idGen ?? (() => randomUUID());
  }

  /** Coalesce a burst of ingests into one rebuild per season. */
  schedule(seasonId: string): void {
    const prev = this.timers.get(seasonId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this.timers.delete(seasonId);
      void this.runNow(seasonId).catch(() => {});
    }, this.debounceMs);
    t.unref();
    this.timers.set(seasonId, t);
  }

  /**
   * Serialized per season: joins the queued follow-up if a build is already
   * in flight, so concurrent callers never stack up parallel rebuilds.
   */
  runNow(seasonId: string): Promise<GenerationResult> {
    const cur = this.running.get(seasonId);
    if (cur) {
      let q = this.queued.get(seasonId);
      if (!q) {
        q = cur.then(
          () => this.exec(seasonId),
          () => this.exec(seasonId),
        );
        this.queued.set(seasonId, q);
      }
      return q;
    }
    return this.exec(seasonId);
  }

  /** Last published generation for a season, or null before the first build. */
  latest(seasonId: string): GenerationInfo | null {
    return this.published.get(seasonId) ?? null;
  }

  /** Resolves once nothing is scheduled or in flight for the season. */
  async pending(seasonId: string): Promise<void> {
    for (;;) {
      if (this.timers.has(seasonId)) {
        await new Promise((r) => setTimeout(r, this.debounceMs + 5));
        continue;
      }
      const run = this.queued.get(seasonId) ?? this.running.get(seasonId);
      if (run) {
        await run.catch(() => {});
        continue;
      }
      break;
    }
  }

  private exec(seasonId: string): Promise<GenerationResult> {
    const p = this.buildOnce(seasonId);
    this.running.set(seasonId, p);
    const done = () => {
      if (this.running.get(seasonId) === p) this.running.delete(seasonId);
      this.queued.delete(seasonId);
    };
    p.then(done, done);
    return p;
  }

  private async buildOnce(seasonId: string): Promise<GenerationResult> {
    let res = await buildGeneration(this.store, seasonId, this.idGen());
    // an ingest landed mid-build — rebuild once against the newer revision
    if (res.status.startsWith("stale_revision")) {
      res = await buildGeneration(this.store, seasonId, this.idGen());
    }
    if (res.status === "published") {
      this.published.set(seasonId, {
        generationId: res.generationId,
        computedAtMs: this.now(),
        inputRevision: res.inputRevision,
        events: res.events,
      });
    }
    return {
      status: res.status,
      events: res.events,
      generationId: res.status === "published" ? res.generationId : null,
    };
  }
}
