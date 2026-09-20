/**
 * tools/check-syntax.mjs — compile-check every addon Lua file under fengari.
 * Exits nonzero on the first syntax error; used as the addon "typecheck".
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { TOC_ORDER } from "./lua-env.mjs";

const fengari = createRequire(import.meta.url)("fengari");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADDON_DIR = join(ROOT, "AzerothCombatLeague");

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

let bad = 0;
for (const f of TOC_ORDER) {
  const abs = join(ADDON_DIR, f);
  if (!existsSync(abs)) {
    console.error(`MISSING ${f} (listed in toc)`);
    bad++;
    continue;
  }
  const code = to_luastring((await import("node:fs")).readFileSync(abs, "utf8"));
  const st = lauxlib.luaL_loadbuffer(L, code, code.length, "@" + f);
  if (st !== lua.LUA_OK) {
    console.error(`SYNTAX ${f}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
    lua.lua_pop(L, 1);
    bad++;
  } else {
    lua.lua_pop(L, 1);
  }
}
console.log(bad === 0 ? "all files compile" : `${bad} file(s) failed`);
process.exit(bad === 0 ? 0 : 1);
