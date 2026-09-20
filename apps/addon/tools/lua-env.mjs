/**
 * tools/lua-env.mjs — fengari-based Lua runtime + WoW API mocks.
 *
 * Loads the addon's Lua files in .toc order into a shared `ACL` namespace so
 * pure-logic modules (codec, frames, domain) can be tested for byte-exact
 * parity with packages/contracts golden fixtures. WoW APIs are mocked; mock
 * state is exposed so tests can drive events.
 */
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fengari = require("fengari");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADDON_DIR = join(ROOT, "AzerothCombatLeague");
const FIXTURES_DIR = join(ROOT, "..", "..", "packages", "contracts", "test", "fixtures");

/** File load order mirroring AzerothCombatLeague.toc. */
export const TOC_ORDER = [
  "Locale/enUS.lua",
  "Util/Bit.lua", "Util/Crc32.lua", "Util/Base64Url.lua", "Util/Sha256.lua",
  "Util/Deflate.lua", "Util/CanonicalJson.lua", "Util/Uuid.lua",
  "Core/Events.lua", "Core/Diagnostics.lua", "Core/State.lua", "Core/Capabilities.lua", "Core/Probes.lua",
  "Domain/Identity.lua", "Domain/Rules.lua", "Domain/Series.lua", "Domain/Contract.lua",
  "Comms/Codec.lua", "Comms/Frames.lua", "Comms/Transport.lua", "Comms/Reliability.lua", "Comms/Dispatch.lua",
  "Adapters/Duel.lua", "Adapters/CombatLog.lua", "Adapters/Aura.lua",
  "Adapters/Inspect.lua", "Adapters/Map.lua", "Adapters/PvPMatch.lua",
  "Sync/Outbox.lua", "Sync/Export.lua", "Sync/Import.lua",
  "UI/Shell.lua", "UI/Challenge.lua", "UI/Result.lua", "UI/RulesEditor.lua",
  "UI/History.lua", "UI/Hub.lua", "UI/Event.lua", "UI/Settings.lua", "UI/TestLab.lua",
  "UI/SyncBadge.lua",
  "Bootstrap.lua",
];

/** WoW API surface used by the addon, as a Lua prelude. Deterministic time. */
const WOW_MOCK_PRELUDE = `
  __wow = {
    timeMs = 1700000000000,
    events = {},          -- event -> list of handlers
    frames = {},
    addonMessages = {},   -- sent frames captured here
    timers = {},
    combatLockdown = false,
    player = {
      name = "TesterA", realm = "Forever", faction = "Alliance",
      guid = "Player-1-00000001", class = "WARRIOR", classId = 1, level = 30,
    },
    target = nil,
    sv = {},              -- SavedVariables store
  }

  function GetTime() return __wow.timeMs / 1000 end
  function GetServerTime() return math.floor(__wow.timeMs / 1000) end
  function GetPreciseTime() return __wow.timeMs / 1000 end
  function time() return math.floor(__wow.timeMs / 1000) end
  function date(fmt, t) return os.date(fmt, t) end
  function GetLocale() return "enUS" end
  function GetBuildInfo() return "1.60.1", "69913", "Sep 18 2026", 10601 end
  function InCombatLockdown() return __wow.combatLockdown end
  function UnitName(unit)
    if unit == "player" then return __wow.player.name, __wow.player.realm end
    if unit == "target" and __wow.target then return __wow.target.name, __wow.target.realm end
    return nil
  end
  function UnitGUID(unit)
    if unit == "player" then return __wow.player.guid end
    if unit == "target" and __wow.target then return __wow.target.guid end
    return nil
  end
  function UnitClass(unit)
    if unit == "player" then return __wow.player.class, __wow.player.class, __wow.player.classId end
    if unit == "target" and __wow.target then return __wow.target.class, __wow.target.class, __wow.target.classId end
    return nil
  end
  function UnitLevel(unit)
    if unit == "player" then return __wow.player.level end
    if unit == "target" and __wow.target then return __wow.target.level end
    return 0
  end
  function UnitFactionGroup(unit)
    if unit == "player" then return __wow.player.faction end
    if unit == "target" and __wow.target then return __wow.target.faction end
    return nil
  end
  function UnitExists(unit) return (unit == "player") or (unit == "target" and __wow.target ~= nil) end
  function UnitIsUnit(a, b) return UnitGUID(a) ~= nil and UnitGUID(a) == UnitGUID(b) end
  function UnitHealth(unit) return 1000 end
  function UnitHealthMax(unit) return 1000 end
  function UnitIsDeadOrGhost(unit) return false end
  function UnitIsPlayer(unit) return UnitExists(unit) end
  function GetRealmName() return __wow.player.realm end
  function GetZoneText() return "Durotar" end
  function GetSubZoneText() return "" end
  function GetMinimapZoneText() return "Durotar" end
  C_Map = { GetBestMapForUnit = function(unit) return 1 end }
  function C_Map_GetBestMapForUnit(unit) return 1 end
  function GetInventoryItemID(unit, slot) return nil end
  function ReloadUI() __wow.reloaded = true end
  function UnitAura(unit, i) return nil end

  C_Timer = {
    _seq = 0,
    After = function(sec, cb) __wow.timers[#__wow.timers + 1] = { at = __wow.timeMs + sec * 1000, cb = cb } end,
    NewTicker = function(sec, cb) __wow.timers[#__wow.timers + 1] = { at = __wow.timeMs + sec * 1000, cb = cb, every = sec } return { Cancel = function() end } end,
  }

  C_ChatInfo = {
    RegisterAddonMessagePrefix = function(prefix) return true end,
    SendAddonMessage = function(prefix, text, channel, target)
      __wow.addonMessages[#__wow.addonMessages + 1] = { prefix = prefix, text = text, channel = channel, target = target }
      return true
    end,
  }

  SendChatMessage = function() end

  function CombatLogGetCurrentEventInfo()
    return nil
  end
  function issecretvalue(v) return false end

  -- minimal frame mock
  local frameMt
  frameMt = { __index = {
    RegisterEvent = function(self, ev) __wow.events[ev] = __wow.events[ev] or {}; table.insert(__wow.events[ev], self) end,
    UnregisterEvent = function(self, ev) end,
    SetScript = function(self, name, fn) self["__" .. name] = fn end,
    GetScript = function(self, name) return self["__" .. name] end,
    HookScript = function(self, name, fn) self["__" .. name] = fn end,
    Show = function(self) self.__shown = true end,
    Hide = function(self) self.__shown = false end,
    IsShown = function(self) return self.__shown or false end,
    SetSize = function() end, SetPoint = function() end, SetMovable = function() end,
    EnableMouse = function() end, RegisterForDrag = function() end,
    SetFrameStrata = function() end, SetClampedToScreen = function() end,
    CreateFontString = function(self)
      return setmetatable({ __text = "",
        SetText = function(s, t) s.__text = t end,
        GetText = function(s) return s.__text end,
        SetPoint = function() end, SetFont = function() end, SetJustifyH = function() end,
        SetTextColor = function() end, SetWidth = function() end, SetWordWrap = function() end,
      }, { __index = function() return function() end end })
    end,
    CreateTexture = function() return setmetatable({}, { __index = function() return function() end end }) end,
  }}
  function CreateFrame(kind, name, parent, template)
    local f = setmetatable({ __name = name, __shown = false, __scripts = {} }, frameMt)
    __wow.frames[name or ("frame" .. #__wow.frames)] = f
    table.insert(__wow.frames, f)
    return f
  end
  UIParent = CreateFrame("Frame", "UIParent")
  UISpecialFrames = {}
  GameTooltip = CreateFrame("Frame", "GameTooltip")
  DEFAULT_CHAT_FRAME = { AddMessage = function(self, msg) __wow.chatLog = (__wow.chatLog or "") .. tostring(msg) .. "\\n" end }
  SlashCmdList = {}

  -- fire a Blizzard event at every frame that registered it
  function __wow.fireEvent(event, ...)
    for _, f in pairs(__wow.events[event] or {}) do
      local h = rawget(f, "__OnEvent")
      if h then h(f, event, ...) end
    end
  end
  function __wow.advance(ms)
    __wow.timeMs = __wow.timeMs + ms
    for _, t in pairs(__wow.timers) do
      if __wow.timeMs >= t.at then
        if t.every then t.at = __wow.timeMs + t.every * 1000 else t.at = math.huge end
        pcall(t.cb)
      end
    end
  end
  -- native bit library implemented on Lua 5.3 operators (fengari).
  -- fengari integers are int32: coerce operands into signed int32 first so
  -- values >= 2^31 work, then normalize results to unsigned.
  local function s32(x)
    x = x % 4294967296
    if x < 0 then x = x + 4294967296 end
    if x >= 2147483648 then x = x - 4294967296 end
    return math.tointeger(x) or x
  end
  bit = {
    band = function(a, b) return (s32(a) & s32(b)) % 4294967296 end,
    bor  = function(a, b) return (s32(a) | s32(b)) % 4294967296 end,
    bxor = function(a, b) return (s32(a) ~ s32(b)) % 4294967296 end,
    bnot = function(a) return (~s32(a)) % 4294967296 end,
    lshift = function(a, n) return (s32(a) << n) % 4294967296 end,
    rshift = function(a, n) return math.floor(((a % 4294967296) + 4294967296) % 4294967296 / (2 ^ n)) end,
  }
`;

/**
 * Create a Lua state with WoW mocks. opts.withBit=false removes the injected
 * native bit lib to exercise Util/Bit's arithmetic fallback.
 */
export function createState(opts = {}) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  const run = (code, name = "chunk") => {
    const buf = to_luastring(code);
    const status = lauxlib.luaL_loadbuffer(L, buf, buf.length, name);
    if (status !== lua.LUA_OK) {
      throw new Error(`load ${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
    }
    const callStatus = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
    if (callStatus !== lua.LUA_OK) {
      throw new Error(`run ${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
    }
  };

  run(WOW_MOCK_PRELUDE, "wow-mock");
  if (opts.withBit === false) run("bit = nil", "no-bit");

  return { L, run };
}

/** Load an addon file with the (addonName, ACL) vararg convention. */
export function loadAddonFile(env, relPath) {
  const { L } = env;
  const abs = join(ADDON_DIR, relPath);
  const code = readFileSync(abs, "utf8");
  const buf = to_luastring(code);
  const status = lauxlib.luaL_loadbuffer(L, buf, buf.length, "@" + relPath);
  if (status !== lua.LUA_OK) {
    throw new Error(`load ${relPath}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  lua.lua_pushstring(L, to_luastring("AzerothCombatLeague"));
  env.pushAcl();
  const callStatus = lua.lua_pcall(L, 2, 0, 0);
  if (callStatus !== lua.LUA_OK) {
    throw new Error(`run ${relPath}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
}

/** Push the shared ACL table onto the stack (creates once, reuses). */
export function makeAclPusher(L) {
  // store ACL in the registry under a light name
  lauxlib.luaL_dostring(L, to_luastring("__ACL_NS = __ACL_NS or {}"));
  return function pushAcl() {
    lua.lua_getglobal(L, to_luastring("__ACL_NS"));
  };
}

export function loadAddon(env, files = TOC_ORDER) {
  env.run("__ACL_NS = __ACL_NS or {}", "acl-ns");
  env.pushAcl = makeAclPusher(env.L);
  for (const f of files) loadAddonFile(env, f);
}

export function getGlobal(L, name) {
  lua.lua_getglobal(L, to_luastring(name));
  return L;
}

export function luaCall(L, luaExpr, name = "eval") {
  const buf = to_luastring("return " + luaExpr);
  const status = lauxlib.luaL_loadbuffer(L, buf, buf.length, name);
  if (status !== lua.LUA_OK) {
    throw new Error(`load ${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  const callStatus = lua.lua_pcall(L, 0, 1, 0);
  if (callStatus !== lua.LUA_OK) {
    throw new Error(`run ${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  const out = to_jsstring(lua.lua_tostring(L, -1)) ?? null;
  lua.lua_pop(L, 1);
  return out;
}

export function readFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}
