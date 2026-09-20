/**
 * paths.ts — WoW install discovery + strict SavedVariables allowlist (docs/27).
 *
 * The companion may read ONLY the addon's SavedVariables file beneath a
 * user-selected install directory. Everything else — other addons' files,
 * account dirs, screenshots — is outside the allowlist and refused.
 */
import { readdirSync, statSync, realpathSync } from "node:fs";
import { join, resolve, sep, normalize } from "node:path";

export const ADDON_DIR_NAME = "AzerothCombatLeague";
export const SV_FILE_NAME = "AzerothCombatLeague.lua";

export interface WatchedFile {
  /** absolute real path of the allowlisted SavedVariables file */
  path: string;
  /** account dir name under WTF/Account (label only — never uploaded raw) */
  accountLabel: string;
}

export class PathError extends Error {
  constructor(message: string, public readonly code:
    | "not_install" | "not_allowlisted" | "escapes_root" | "not_found") {
    super(message);
    this.name = "PathError";
  }
}

/** Is `candidate` inside `root` after normalization? */
export function isInside(root: string, candidate: string): boolean {
  const r = normalize(resolve(root)) + sep;
  const c = normalize(resolve(candidate));
  return c.startsWith(r);
}

/**
 * Validate a user-selected WoW install directory. We require the presence of
 * either the addon dir or a WTF dir so we don't silently accept a wrong path.
 */
export function validateInstallDir(dir: string): string {
  const abs = realpathSync(dir);
  let ok = false;
  try {
    ok =
      statSync(join(abs, "WTF")).isDirectory() ||
      statSync(join(abs, "Interface", "AddOns", ADDON_DIR_NAME)).isDirectory();
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new PathError(
      `${dir} does not look like a WoW install (no WTF/ or Interface/AddOns/${ADDON_DIR_NAME}/)`,
      "not_install",
    );
  }
  return abs;
}

/**
 * List allowlisted SavedVariables targets under an install dir:
 *   <root>/WTF/Account/<ACCOUNT>/SavedVariables/AzerothCombatLeague.lua
 * Per-character variants are outside v2.2's account-wide SavedVariables.
 */
export function listSavedVariables(installDir: string): WatchedFile[] {
  const root = validateInstallDir(installDir);
  const acctDir = join(root, "WTF", "Account");
  const out: WatchedFile[] = [];
  let accounts: string[] = [];
  try {
    accounts = readdirSync(acctDir).filter((d) => {
      try { return statSync(join(acctDir, d)).isDirectory(); } catch { return false; }
    });
  } catch {
    return out;
  }
  for (const acct of accounts) {
    const f = join(acctDir, acct, "SavedVariables", SV_FILE_NAME);
    try {
      if (statSync(f).isFile()) out.push({ path: f, accountLabel: acct });
    } catch { /* not present yet — WoW creates it on first save */ }
  }
  return out;
}

/**
 * The single place that turns a requested file path into an allowlisted
 * readable path. Returns the resolved path or throws PathError.
 */
export function allowlistCheck(installDir: string, requested: string): string {
  const root = realpathSync(installDir);
  const real = realpathSync(requested);
  if (!isInside(root, real)) {
    throw new PathError(`${requested} is outside the install directory`, "escapes_root");
  }
  const rel = real.slice(root.length + 1).split(sep);
  // WTF/Account/<acct>/SavedVariables/AzerothCombatLeague.lua
  const ok =
    rel.length === 5 &&
    rel[0] === "WTF" &&
    rel[1] === "Account" &&
    rel[3] === "SavedVariables" &&
    rel[4] === SV_FILE_NAME;
  if (!ok) {
    throw new PathError(`${requested} is not an allowlisted addon file`, "not_allowlisted");
  }
  return real;
}

/**
 * The ONE file the companion may write: a data-only payload inside our own
 * addon directory (the TSM/Raider.IO pattern). WoW loads it on next reload;
 * the addon imports it once by digest. Nothing else under Interface/ is
 * touched — no overwriting addon code, no other addons' files.
 */
export function inboundFilePath(installDir: string): string {
  const root = validateInstallDir(installDir);
  return join(root, "Interface", "AddOns", ADDON_DIR_NAME, "Data", "Inbound.lua");
}
