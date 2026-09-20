/**
 * watcher.ts — debounced stable-size file watcher (docs/27).
 *
 * WoW writes SavedVariables non-atomically on some builds, so a size check
 * alone is not enough: we require the file's (size, mtime) to remain stable
 * across `stablePolls` polls spaced `stableMs` apart, then hand off a read
 * snapshot. A truncated/failed parse reschedules instead of failing.
 */
import { statSync, watch, type FSWatcher } from "node:fs";

export interface WatcherOptions {
  pollMs?: number;      // fallback poll + stability poll interval
  stablePolls?: number; // consecutive identical stats required
  debounceMs?: number;  // quiet period after last fs event
}

export class SvWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private fsWatcher: FSWatcher | null = null;
  private lastSig = "";
  private stableCount = 0;
  private lastEventAt = 0;
  private stopped = false;

  constructor(
    private readonly path: string,
    private readonly onStable: (path: string) => void,
    private readonly opts: WatcherOptions = {},
  ) {}

  start(): void {
    const pollMs = this.opts.pollMs ?? 500;
    // fs.watch for promptness; interval poll for reliability (rotation,
    // missed events, network drives).
    try {
      this.fsWatcher = watch(this.path, () => { this.lastEventAt = Date.now(); });
      this.fsWatcher.on("error", () => { /* fall back to polling */ });
    } catch { /* file may not exist yet — polling covers it */ }
    this.timer = setInterval(() => this.poll(), pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.fsWatcher?.close();
  }

  private poll(): void {
    if (this.stopped) return;
    const debounceMs = this.opts.debounceMs ?? 250;
    if (Date.now() - this.lastEventAt < debounceMs) {
      this.stableCount = 0;
      return;
    }
    let sig: string;
    try {
      const st = statSync(this.path);
      sig = `${st.size}:${st.mtimeMs}:${st.ino}`;
    } catch {
      this.lastSig = "";
      this.stableCount = 0;
      return;
    }
    if (sig === this.lastSig) {
      this.stableCount++;
      if (this.stableCount >= (this.opts.stablePolls ?? 2)) {
        this.stableCount = 0;
        this.onStable(this.path);
      }
    } else {
      this.lastSig = sig;
      this.stableCount = 0;
    }
  }
}
