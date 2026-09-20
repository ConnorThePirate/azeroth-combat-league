/**
 * ratelimit.ts — sliding-window request limiter, in-memory and bounded.
 *
 * Each key keeps only the timestamps still inside its window; a periodic
 * sweep drops keys whose newest hit is older than the largest window seen,
 * so idle clients don't accumulate memory.
 */
export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly sweepEveryMs: number;
  private lastSweep: number;
  private maxWindowMs = 0;

  constructor(opts?: { now?: () => number; sweepEveryMs?: number }) {
    this.now = opts?.now ?? (() => Date.now());
    this.sweepEveryMs = opts?.sweepEveryMs ?? 60_000;
    this.lastSweep = this.now();
  }

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const t = this.now();
    if (windowMs > this.maxWindowMs) this.maxWindowMs = windowMs;
    if (t - this.lastSweep >= this.sweepEveryMs) this.sweep(t);
    const cutoff = t - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((h) => h > cutoff);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      const retryMs = recent[0]! + windowMs - t;
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    return { ok: true, retryAfterSec: 0 };
  }

  private sweep(t: number): void {
    this.lastSweep = t;
    const cutoff = t - this.maxWindowMs;
    for (const [k, arr] of this.hits) {
      const kept = arr.filter((h) => h > cutoff);
      if (kept.length === 0) this.hits.delete(k);
      else this.hits.set(k, kept);
    }
  }
}
