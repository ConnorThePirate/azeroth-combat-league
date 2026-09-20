/**
 * lifecycle.ts — tie the companion to the game process (docs/27 UX).
 *
 * The companion only needs to live while WoW does: reports flush on
 * /reload and land on disk while the game runs; when WoW exits, one final
 * flush + drain, then the companion exits too. Two entry modes:
 *
 *   play            — companion launches WoW itself (replaces the shortcut)
 *   run --with-wow  — polls for the process; starts/stops with it
 *
 * Process detection is injectable so tests never touch the real proc table.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

/** Executable names we've seen on Forever-era clients (win + wine). */
const EXE_RE = /^(wow|wow-?64|wowclassic|world of warcraft)(\.exe)?$/i;

export type WowProbe = () => boolean | Promise<boolean>;

/** Locate the game executable inside the install dir. */
export function findWowExe(installDir: string): string | null {
  try {
    const hit = readdirSync(installDir).find((f) => EXE_RE.test(f));
    return hit ? join(installDir, hit) : null;
  } catch {
    return null;
  }
}

/**
 * Linux probe via /proc. Two accepted shapes:
 *   - comm equals the exe name (native binary, or Wine naming the process
 *     after the loaded exe)
 *   - a wine/wine64 host process carrying the exe name in its cmdline
 * Deliberately NOT `pgrep -f`-style matching: a shell, editor, or script
 * whose command line merely mentions "Wow.exe" must not count.
 */
function linuxProbe(exeName: string, selfPid: number): boolean {
  const stem = exeName.replace(/\.exe$/i, "").toLowerCase();
  const selfPpid = (() => {
    try { return Number(process.ppid); } catch { return -1; }
  })();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === selfPid || pid === selfPpid) continue;
    try {
      const comm = readFileSync(`/proc/${entry}/comm`, "utf8").trim();
      if (comm.toLowerCase() === stem ||
          comm.toLowerCase() === exeName.toLowerCase()) return true;
      if (!/^wine/i.test(comm)) continue;
      const cmd = readFileSync(`/proc/${entry}/cmdline`, "utf8");
      if (cmd.toLowerCase().includes(exeName.toLowerCase())) return true;
    } catch { /* process vanished mid-scan */ }
  }
  return false;
}

/**
 * Default probe: does the game process exist? tasklist on Windows (exact
 * image-name match); /proc scan on Linux; pgrep -f elsewhere (macOS).
 */
export function processProbe(exeName: string): WowProbe {
  return () => {
    try {
      if (process.platform === "win32") {
        const out = execFileSync(
          "tasklist", ["/FI", `IMAGENAME eq ${exeName}`, "/NH"],
          { encoding: "utf8", timeout: 5000 });
        return out.toLowerCase().includes(exeName.toLowerCase());
      }
      if (process.platform === "linux") return linuxProbe(exeName, process.pid);
      execFileSync("pgrep", ["-f", exeName], { timeout: 5000 });
      return true;
    } catch {
      return false; // pgrep exits 1 on no match; timeouts treated as down
    }
  };
}

export interface WowLifecycleOptions {
  isRunning: WowProbe;
  onUp: () => void | Promise<void>;
  /** Called each time the process exits — drain the queue here. */
  onDown: () => void | Promise<void>;
  pollMs?: number;
  /**
   * Keep watching after the game exits (players relog constantly — addon
   * updates, disconnects, switches). Default false: resolve after the
   * first session ends.
   */
  persistent?: boolean;
  /** Checked between polls; return true to stop the loop cleanly. */
  shouldStop?: () => boolean;
}

/**
 * Idle until the game appears, run onUp while it's up, onDown when it
 * exits. Non-persistent mode resolves "exited" after the first session;
 * persistent mode goes back to waiting for the next launch and resolves
 * "stopped" only when shouldStop fires.
 */
export async function runWithWow(
  opts: WowLifecycleOptions,
): Promise<"exited" | "stopped"> {
  const pollMs = opts.pollMs ?? 3000;
  let up = await opts.isRunning();
  if (up) await opts.onUp();
  for (;;) {
    if (opts.shouldStop?.()) {
      if (up) await opts.onDown();
      return "stopped";
    }
    await new Promise((r) => setTimeout(r, pollMs));
    const now = await opts.isRunning();
    if (now && !up) {
      up = true;
      await opts.onUp();
    } else if (!now && up) {
      up = false;
      await opts.onDown();
      if (!opts.persistent) return "exited";
    }
  }
}

export interface PlayOptions {
  exePath: string;
  args?: string[];
  /** spawn override for tests */
  spawnFn?: (cmd: string, args: string[]) => ChildProcess;
}

/**
 * Launch the game, resolve when it exits. The caller runs the service for
 * the duration — the companion never outlives the game.
 */
export function launchGame(opts: PlayOptions): Promise<number | null> {
  const spawnFn = opts.spawnFn ?? ((c: string, a: string[]) =>
    spawn(c, a, { stdio: "ignore" }));
  return new Promise((resolve, reject) => {
    const child = spawnFn(opts.exePath, opts.args ?? []);
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
}
