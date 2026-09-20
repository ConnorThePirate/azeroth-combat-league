/**
 * service.ts — the companion orchestrator (docs/27).
 *
 * Watches allowlisted SavedVariables, parses them as data, extracts queued
 * outbox batches, spools, and uploads when a scoped credential is present.
 * Writes exactly ONE file — Interface/AddOns/AzerothCombatLeague/Data/
 * Inbound.lua — carrying the WFU1 update bundle (receipts, ratings,
 * published rulesets) the addon picks up on next reload. It never touches
 * the SavedVariables file while WoW might be writing (stable-size gate).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseSavedVariables, LuaDataError } from "./luadata.js";
import { allowlistCheck, inboundFilePath, listSavedVariables, type WatchedFile } from "./paths.js";
import { SvWatcher } from "./watcher.js";
import { Spool, type SpoolEntry } from "./spool.js";
import { UploaderClient, UploadError } from "./client.js";
import type { CredentialStore } from "./credentials.js";

export interface CompanionConfig {
  installDir: string;
  serverUrl: string;
  bandwidthCapBps?: number;   // optional soft cap between batch uploads
  paused?: boolean;
}

export type CompanionState =
  | "idle" | "watching" | "paused" | "offline" | "needs_auth" | "error";

export interface StatusSnapshot {
  state: CompanionState;
  watching: string[];
  spool: Record<string, number>;
  lastUploadAtMs?: number;
  lastError?: string;
}

export interface ExtractedBatch {
  nonces: string[];
  payloads: unknown[];
  contracts: unknown[];
}

/**
 * Pull the addon outbox from a parsed SavedVariables DB.
 * Shape (addon Sync/Outbox.lua): db.outbox[messageId] = {payload, queuedAtMs},
 * db.reports[nonce] = {status, ...}. We only upload reports whose local
 * status is queued/saved — acked ones are already delivered.
 * db.contracts[sessionId] holds the canonical contract docs the server
 * needs to validate new sessions.
 */
export function extractPendingReports(db: Record<string, unknown>): ExtractedBatch {
  const reports = (db.reports ?? {}) as Record<string, { status?: string; body?: unknown }>;
  const nonces: string[] = [];
  const payloads: unknown[] = [];
  for (const [nonce, r] of Object.entries(reports)) {
    if (r && typeof r === "object" && (r.status === "queued" || r.status === "saved")) {
      if (r.body !== undefined) {
        nonces.push(nonce);
        payloads.push(r.body);
      }
    }
  }
  const contracts = (db.contracts ?? {}) as Record<string, unknown>;
  return { nonces, payloads, contracts: Object.values(contracts) };
}

export class CompanionService {
  private watchers: SvWatcher[] = [];
  private files: WatchedFile[] = [];
  private state: CompanionState = "idle";
  private lastError: string | undefined;
  private lastUploadAtMs: number | undefined;
  private uploading = false;

  constructor(
    private readonly config: CompanionConfig,
    private readonly spool: Spool,
    private readonly creds: CredentialStore,
    private readonly client: UploaderClient,
    private readonly onStatus?: (s: StatusSnapshot) => void,
  ) {}

  start(): void {
    this.files = listSavedVariables(this.config.installDir);
    if (this.files.length === 0) {
      // The SV file appears on first save — watch likely account dirs anyway
      // is complex; simplest honest state: watching the install for the file.
      this.state = "watching";
    } else {
      this.state = "watching";
    }
    for (const f of this.files) this.watchFile(f.path);
    this.emit();
  }

  stop(): void {
    for (const w of this.watchers) w.stop();
    this.watchers = [];
    this.state = "idle";
    this.emit();
  }

  setPaused(paused: boolean): void {
    this.config.paused = paused;
    this.state = paused ? "paused" : "watching";
    this.emit();
  }

  /** Re-scan for SavedVariables files (e.g. after first addon save). */
  rescan(): void {
    const known = new Set(this.files.map((f) => f.path));
    for (const f of listSavedVariables(this.config.installDir)) {
      if (!known.has(f.path)) {
        this.files.push(f);
        this.watchFile(f.path);
      }
    }
    this.emit();
  }

  /**
   * Final-pass read of every known SavedVariables file. WoW flushes
   * SavedVariables on exit — the last write can land after the watcher's
   * final poll. Safe to run anytime: extractPendingReports only surfaces
   * nonces the spool hasn't already acked.
   */
  async sweepNow(): Promise<void> {
    this.rescan();
    for (const f of this.files) await this.onStableFile(f.path);
  }

  private watchFile(path: string): void {
    const w = new SvWatcher(path, (p) => void this.onStableFile(p));
    w.start();
    this.watchers.push(w);
  }

  /** Stable file -> parse -> extract -> spool -> try upload. */
  async onStableFile(path: string): Promise<void> {
    try {
      allowlistCheck(this.config.installDir, path); // belt & suspenders
    } catch {
      return; // outside allowlist — refuse to read
    }
    let db: Record<string, unknown>;
    try {
      const text = readFileSync(path, "utf8");
      const parsed = parseSavedVariables(text);
      const sv = parsed.AzerothCombatLeagueDB;
      if (!sv || typeof sv !== "object" || Array.isArray(sv)) return;
      db = sv as Record<string, unknown>;
    } catch (e) {
      // Truncated/incomplete write — retry on next change, keep evidence.
      if (e instanceof LuaDataError && e.code === "truncated") return;
      this.lastError = `unreadable file: ${(e as Error).message}`;
      this.state = "error";
      this.emit();
      return;
    }
    const { nonces, payloads, contracts } = extractPendingReports(db);
    const fresh = nonces.filter((n) => !this.spool.isAcked(n));
    if (fresh.length === 0) return;
    const payloadMap = nonces
      .map((n, i) => ({ n, p: payloads[i] }))
      .filter((x) => fresh.includes(x.n));
    this.spool.add(path,
      { reports: payloadMap.map((x) => x.p), contracts }, fresh);
    this.emit();
    await this.flushQueue();
  }

  /** Attempt upload of all due spool entries. */
  async flushQueue(): Promise<void> {
    if (this.uploading || this.config.paused) return;
    const due = this.spool.due();
    const cred = await this.creds.get();
    if (!cred) {
      // nothing to send and no session — stay quiet, not alarming
      if (due.length > 0) {
        this.state = "needs_auth";
        this.lastError = "sign-in expired — re-pair the companion";
        this.emit();
      }
      return;
    }
    if (due.length === 0) {
      // empty queue — still a good moment to stage inbound updates
      await this.writeInbound(cred.token);
      return;
    }
    this.uploading = true;
    try {
      for (const e of due) {
        this.spool.markUploading(e);
        try {
          const res = await this.client.uploadBatch(
            cred.token, e.payload as { reports: unknown[]; contracts?: unknown[] });
          // server dedupe makes full-batch success safe; partial attention
          // items stay visible via receipts without resubmitting evidence
          void res;
          this.spool.markDone(e);
          this.lastUploadAtMs = Date.now();
          this.state = "watching";
          // inbound half of the round-trip: pull the WFU1 bundle and stage it
          // where the addon loads it on next reload
          await this.writeInbound(cred.token);
        } catch (err) {
          if (err instanceof UploadError) {
            if (err.kind === "transient") {
              this.spool.markRetry(e, err.message);
              this.state = "offline";
              this.lastError = "offline — will retry automatically";
              break; // likely connectivity; stop hammering
            } else if (err.kind === "auth") {
              this.spool.markRetry(e, err.message);
              this.state = "needs_auth";
              this.lastError = err.message;
              break;
            } else {
              this.spool.quarantine(e, err.message);
              this.lastError = err.message;
            }
          } else {
            this.spool.markRetry(e, (err as Error).message);
          }
        }
        if (this.config.bandwidthCapBps) {
          // soft pacing between batches
          await new Promise((r) => setTimeout(r, 250));
        }
        this.emit();
      }
    } finally {
      this.uploading = false;
      this.emit();
    }
  }

  /**
   * Fetch the WFU1 bundle and stage it as Data/Inbound.lua inside our addon
   * dir. Atomic (tmp + rename); failure is non-fatal — the next upload or
   * manual sync retries.
   */
  private async writeInbound(token: string): Promise<void> {
    try {
      const { update } = await this.client.addonUpdate(token);
      if (typeof update !== "string" || !update.startsWith("WFU1:")) return;
      const dest = inboundFilePath(this.config.installDir);
      mkdirSync(dirname(dest), { recursive: true });
      // payload alphabet is WFU1:<base64url>:<crc> — quote defensively anyway
      const safe = update.replace(/["\\\n\r]/g, (c) => `\\${c}`);
      const tmp = dest + ".tmp";
      writeFileSync(tmp,
        "-- written by the ACL companion; do not edit\n" +
        `ACL_INBOUND_PAYLOAD = "${safe}"\n`, "utf8");
      renameSync(tmp, dest);
    } catch {
      // never fail an upload because the inbound half couldn't be staged
    }
  }

  status(): StatusSnapshot {
    return {
      state: this.state,
      watching: this.files.map((f) => f.path),
      spool: this.spool.counts(),
      ...(this.lastUploadAtMs !== undefined ? { lastUploadAtMs: this.lastUploadAtMs } : {}),
      ...(this.lastError !== undefined ? { lastError: this.lastError } : {}),
    };
  }

  private emit(): void {
    this.onStatus?.(this.status());
  }
}
