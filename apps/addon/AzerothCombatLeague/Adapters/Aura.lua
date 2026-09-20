--[[
  Adapters/Aura.lua — aura/buff snapshot for ready-phase checks (docs/04, 08).

  Aura fields may be secret or restricted; each read is guarded and
  unobservable data is reported as a coverage gap, never silently treated
  as absent.
]]
local _, ACL = ...

local Aura = {}

local function isSecret(v)
  return issecretvalue and issecretvalue(v) or false
end

--- Snapshot buffs on a unit; returns {auras={{spellId,...}}, coverage=...}.
function Aura.snapshot(unit)
  local out = { auras = {}, coverage = "unavailable" }
  if not (C_UnitAuras and C_UnitAuras.GetAuraDataByIndex or _G.UnitAura) then
    return out
  end
  out.coverage = "observable"
  local i = 1
  while true do
    local data
    if C_UnitAuras and C_UnitAuras.GetAuraDataByIndex then
      data = C_UnitAuras.GetAuraDataByIndex(unit, i, "HELPFUL")
    else
      local name, _, _, _, _, _, _, _, _, spellId = UnitAura(unit, i, "HELPFUL")
      if name then data = { name = name, spellId = spellId } end
    end
    if not data then break end
    if isSecret(data.spellId) then
      out.coverage = "partial"
    else
      out.auras[#out.auras + 1] = { spellId = data.spellId, name = data.name }
    end
    i = i + 1
    if i > 64 then break end
  end
  return out
end

ACL.Aura = Aura
