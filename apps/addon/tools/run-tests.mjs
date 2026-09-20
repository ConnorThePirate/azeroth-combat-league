/**
 * tools/run-tests.mjs — run the addon's Lua tests under fengari.
 *
 * Loads addon modules in .toc order with WoW mocks, injects the golden
 * fixtures from packages/contracts/test/fixtures, then runs every
 * tests/*.lua file. Each test file registers cases via the global `T`
 * helpers; results print in TAP-ish form and the exit code reflects failure.
 *
 * Usage: node tools/run-tests.mjs [--no-native-bit]
 *   --no-native-bit  run twice: once with the injected bit library and once
 *                    without (exercises Util/Bit's arithmetic fallback)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createState, loadAddon, TOC_ORDER, readFixture } from "./lua-env.mjs";

const fengariRef = createRequire(import.meta.url)("fengari");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADDON_DIR = join(ROOT, "AzerothCombatLeague");
const TESTS_DIR = join(ROOT, "tests");

/** Serialize a JS value to a Lua literal (UTF-8 strings emitted raw). */
export function toLua(v) {
  if (v === null) return "nil";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") {
    return '"' + v.replace(/[\\"\n\r\t\x00-\x1f]/g, (c) => {
      if (c === "\\") return "\\\\";
      if (c === '"') return '\\"';
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      if (c === "\t") return "\\t";
      return "\\" + c.charCodeAt(0); // decimal byte escape
    }) + '"';
  }
  if (Array.isArray(v)) return "{" + v.map(toLua).join(",") + "}";
  return "{" + Object.entries(v).map(([k, x]) => `[${toLua(k)}]=${toLua(x)}`).join(",") + "}";
}

const T_PRELUDE = `
  __TESTS = {}
  T = {
    test = function(name, fn) __TESTS[#__TESTS + 1] = { name = name, fn = fn } end,
    eq = function(a, b, msg)
      if a ~= b then error("expected " .. tostring(b) .. " got " .. tostring(a) .. (msg and (" — " .. msg) or ""), 2) end
    end,
    ok = function(v, msg) if not v then error("expected truthy" .. (msg and (" — " .. msg) or ""), 2) end end,
    isNil = function(v, msg) if v ~= nil then error("expected nil got " .. tostring(v), 2) end end,
    throws = function(fn, code)
      local ok, e = pcall(fn)
      if ok then error("expected error", 2) end
      if code then
        local c = type(e) == "table" and e.code or tostring(e):match("[%a_]+")
        if c ~= code then error("expected error code " .. code .. " got " .. tostring(type(e) == "table" and e.code or e), 2) end
      end
    end,
    errCode = function(v) return type(v) == "table" and v.code or nil end,
  }
  function hexToBytes(hex)
    return (hex:gsub("..", function(cc) return string.char(tonumber(cc, 16)) end))
  end
  function bytesToHex(s)
    return (s:gsub(".", function(b) return string.format("%02x", b:byte()) end))
  end
  FIXTURES = {}
`;

const RUN_TESTS = `
  local pass, fail = 0, 0
  for _, t in ipairs(__TESTS) do
    local ok, e = pcall(t.fn)
    if ok then
      pass = pass + 1
      print("ok " .. t.name)
    else
      fail = fail + 1
      print("FAIL " .. t.name .. " — " .. tostring(type(e) == "table" and (e.code .. ": " .. e.message) or e))
    end
  end
  __RESULT_PASS, __RESULT_FAIL = pass, fail
`;

function luaInt(env, name) {
  const { lua, to_luastring } = env.fengari;
  lua.lua_getglobal(env.L, to_luastring(name));
  return lua.lua_tointegerx(env.L, -1, null);
}

function runSuite(withBit) {
  const env = createState({ withBit });
  env.fengari = fengariRef;
  const files = TOC_ORDER.filter((f) => existsSync(join(ADDON_DIR, f)));
  loadAddon(env, files);

  env.run(T_PRELUDE, "t-prelude");

  // inject golden fixtures via the addon's own converter
  const fixtures = {
    canonical: readFixture("canonical.json"),
    deflate: readFixture("deflate.json"),
    envelopes: readFixture("envelopes.json"),
    primitives: readFixture("primitives.json"),
  };
  env.run("FIXTURES = " + toLua(fixtures), "fixtures");

  const testFiles = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".lua")).sort();
  for (const tf of testFiles) {
    const src = readFileSync(join(TESTS_DIR, tf), "utf8");
    env.run(src, tf);
  }
  env.run(RUN_TESTS, "run-tests");
  return { pass: luaInt(env, "__RESULT_PASS"), fail: luaInt(env, "__RESULT_FAIL") };
}

const runs = process.argv.includes("--no-native-bit") ? [false] : [true, false];
let failed = false;
for (const withBit of runs) {
  console.log(withBit ? "\n=== suite: native bit ===" : "\n=== suite: fallback bit ===");
  try {
    const r = runSuite(withBit);
    console.log(`--- ${r.pass} passed, ${r.fail} failed ---`);
    if (r.fail > 0) failed = true;
  } catch (e) {
    console.error("suite crashed:", e.message);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
