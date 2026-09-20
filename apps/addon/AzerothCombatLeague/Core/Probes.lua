--[[
  Core/Probes.lua — passive capability probes (docs/04, 30).

  Safe read-only probes only: API presence, event registration, permitted
  reads on the player's own unit. Never pcall-coerces secret values, never
  sends anything during combat, never claims a pass from source inspection.
]]
local _, ACL = ...

local Probes = {}

local function has(fn) return type(fn) == "function" end

--- Run all passive probes once; safe to repeat.
function Probes.runPassive()
  local C = ACL.Capabilities

  -- addon messaging
  if C_ChatInfo and has(C_ChatInfo.SendAddonMessage) then
    C.report("addon_whisper", "observed_source", "SendAddonMessage present")
  else
    C.report("addon_whisper", "fail", "SendAddonMessage missing")
  end

  -- combat log
  if has(CombatLogGetCurrentEventInfo) then
    C.report("combat_log", "observed_source", "CombatLogGetCurrentEventInfo present")
  else
    C.report("combat_log", "fail", "CombatLogGetCurrentEventInfo missing")
  end

  -- auras on self
  if (C_UnitAuras and has(C_UnitAuras.GetAuraDataByIndex)) or has(UnitAura) then
    local snap = ACL.Aura.snapshot("player")
    C.report("aura_read", snap.coverage == "observable" and "partial" or "unknown",
      "self-aura read " .. snap.coverage)
  else
    C.report("aura_read", "fail", "no aura API")
  end

  -- map ids
  if C_Map and has(C_Map.GetBestMapForUnit) then
    local m = C_Map.GetBestMapForUnit("player")
    C.report("map_area", m and "tested_pass" or "partial",
      m and ("mapId " .. tostring(m)) or "nil mapId")
  else
    C.report("map_area", "fail", "C_Map missing")
  end

  -- inventory inspect on self
  if has(GetInventoryItemID) then
    local id = GetInventoryItemID("player", 1)
    C.report("inspect_ready", "partial", id and ("slot1 itemId " .. id) or "slot1 empty")
  else
    C.report("inspect_ready", "fail", "GetInventoryItemID missing")
  end

  -- duel events stay unknown until actually observed firing
  if C.get("duel_events") == "unknown" then
    C.report("duel_events", "observed_source", "registered; awaiting live duel")
  end

  ACL.Diagnostics.add("info", "probes", "passive probe run complete")
end

ACL.Probes = Probes
