/**
 * tools/package.mjs — stage a release folder for the addon.
 *
 * Copies AzerothCombatLeague/ (only the files listed in the .toc plus the
 * .toc itself) into dist/AzerothCombatLeague, excluding tests/tools/dev
 * artifacts per docs/05 ("release ZIP contains one addon folder").
 * Produces a .zip if the `zip` binary exists; otherwise leaves the folder.
 */
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "AzerothCombatLeague");
const DIST = join(ROOT, "dist", "AzerothCombatLeague");

const toc = join(SRC, "AzerothCombatLeague.toc");
const tocText = (await import("node:fs")).readFileSync(toc, "utf8");
const files = ["AzerothCombatLeague.toc"];
for (const line of tocText.split(/\r?\n/)) {
  const l = line.trim();
  if (!l || l.startsWith("##") || l.startsWith("#")) continue;
  files.push(l.replace(/\\/g, "/"));
}

rmSync(DIST, { recursive: true, force: true });
for (const f of files) {
  const src = join(SRC, f);
  if (!existsSync(src)) {
    console.error("missing toc-listed file:", f);
    process.exit(1);
  }
  const dst = join(DIST, f);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}
console.log(`staged ${files.length} files -> dist/AzerothCombatLeague`);

try {
  execSync("zip -qr AzerothCombatLeague.zip AzerothCombatLeague", {
    cwd: join(ROOT, "dist"), stdio: "inherit",
  });
  console.log("dist/AzerothCombatLeague.zip");
} catch {
  console.log("zip binary unavailable — folder staged without archive");
}
