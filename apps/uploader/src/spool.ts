/**
 * spool.ts — durable local upload spool with dedupe (docs/27).
 *
 * Every candidate batch is written to the spool keyed by content digest
 * before upload. Report nonces are tracked in a server-ack ledger so a
 * crash/restart never double-submits, and a repeated save of identical
 * bytes is a no-op.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";

export type SpoolStatus = "pending" | "uploading" | "done" | "quarantined";

export interface SpoolEntry {
  digest: string;
  capturedAtMs: number;
  source: string;         // watched file path (label)
  nonces: string[];       // report nonces contained in the batch
  payload: unknown;       // parsed outbox payloads
  attempts: number;
  status: SpoolStatus;
  lastError?: string;
  nextAttemptAtMs?: number;
}

export class Spool {
  private dir: string;
  private entries = new Map<string, SpoolEntry>();
  /** nonce -> digest that was acknowledged by the server */
  private acked = new Set<string>();

  constructor(root: string) {
    this.dir = join(root, "spool");
    mkdirSync(this.dir, { recursive: true });
    this.load();
  }

  private load(): void {
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const e = JSON.parse(readFileSync(join(this.dir, f), "utf8")) as SpoolEntry;
        this.entries.set(e.digest, e);
        if (e.status === "done") for (const n of e.nonces) this.acked.add(n);
        if (e.status === "uploading") e.status = "pending"; // crash during upload
      } catch { /* corrupt entry — leave file, skip */ }
    }
  }

  private persist(e: SpoolEntry): void {
    const tmp = join(this.dir, `${e.digest}.tmp`);
    const dst = join(this.dir, `${e.digest}.json`);
    writeFileSync(tmp, JSON.stringify(e, null, 2));
    renameSync(tmp, dst); // atomic-ish on same fs
  }

  static digestOf(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  /** Nonces already acknowledged by the server. */
  isAcked(nonce: string): boolean {
    return this.acked.has(nonce);
  }

  /**
   * Add a batch. Returns the entry, or null if identical bytes or all
   * contained nonces are already acknowledged.
   */
  add(source: string, payload: unknown, nonces: string[]): SpoolEntry | null {
    const fresh = nonces.filter((n) => !this.acked.has(n));
    if (nonces.length > 0 && fresh.length === 0) return null;
    const digest = Spool.digestOf(payload);
    const existing = this.entries.get(digest);
    if (existing) return existing.status === "done" ? null : existing;
    const e: SpoolEntry = {
      digest,
      capturedAtMs: Date.now(),
      source,
      nonces: fresh.length > 0 ? fresh : nonces,
      payload,
      attempts: 0,
      status: "pending",
    };
    this.entries.set(digest, e);
    this.persist(e);
    return e;
  }

  /** Entries ready for an upload attempt. */
  due(now = Date.now()): SpoolEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.status === "pending" && (e.nextAttemptAtMs ?? 0) <= now,
    );
  }

  markUploading(e: SpoolEntry): void {
    e.status = "uploading";
    e.attempts++;
    this.persist(e);
  }

  markDone(e: SpoolEntry): void {
    e.status = "done";
    for (const n of e.nonces) this.acked.add(n);
    this.persist(e);
  }

  /** Transient failure — retry with capped exponential backoff. */
  markRetry(e: SpoolEntry, reason: string, baseMs = 5_000, capMs = 30 * 60_000): void {
    e.status = "pending";
    e.lastError = reason;
    e.nextAttemptAtMs = Date.now() + Math.min(capMs, baseMs * 2 ** Math.min(e.attempts, 10));
    this.persist(e);
  }

  /** Permanent failure — keep for diagnostics, never auto-delete evidence. */
  quarantine(e: SpoolEntry, reason: string): void {
    e.status = "quarantined";
    e.lastError = reason;
    this.persist(e);
  }

  counts(): Record<SpoolStatus, number> {
    const c: Record<SpoolStatus, number> = { pending: 0, uploading: 0, done: 0, quarantined: 0 };
    for (const e of this.entries.values()) c[e.status]++;
    return c;
  }

  list(): SpoolEntry[] {
    return [...this.entries.values()];
  }
}
