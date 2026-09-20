--[[
  Adapters/CombatLog.lua — combat log observation (docs/04, 28).

  COMBAT_LOG_EVENT_UNFILTERED is restriction-flagged on this client lineage:
  payloads may be secret or withheld. We never coerce secret values; when the
  client marks them secret we record the fact as unobservable, and detector
  coverage reports "unavailable" rather than "clean".
]]
local _, ACL = ...

local CombatLog = {}

local function isSecret(v)
  return issecretvalue and issecretvalue(v) or false
end

local state = { restricted = nil, subscribed = false }
local listeners = {}

function CombatLog.init()
  ACL.Events.on("COMBAT_LOG_EVENT_UNFILTERED", function()
    CombatLog.onEvent()
  end)
end

--- Classify one event into a normalized fact for the rules engine.
--- Never serializes secret values; emits {kind, sourceGuid, destGuid, ...}.
function CombatLog.onEvent()
  if not (CombatLogGetCurrentEventInfo) then
    ACL.Capabilities.report("combat_log", "fail", "event info unavailable")
    return
  end
  local ts, subevent, _, srcGuid, srcName, srcFlags, srcRaidFlags,
        dstGuid, dstName, dstFlags, dstRaidFlags = CombatLogGetCurrentEventInfo()

  if isSecret(srcGuid) or isSecret(dstGuid) then
    ACL.Capabilities.report("combat_log", "partial", "secret guid fields")
    return
  end

  local fact = {
    t = ts, subevent = subevent,
    sourceGuid = srcGuid, destGuid = dstGuid,
  }

  -- extract trailing spell/item fields conservatively
  if subevent and subevent:sub(1, 5) == "SPELL" then
    local spellId, spellName = select(12, CombatLogGetCurrentEventInfo())
    if not isSecret(spellId) then
      fact.spellId = spellId
      fact.spellName = spellName
      fact.category = CombatLog.classifySpell(spellId)
    end
  elseif subevent == "SPELL_CAST_SUCCESS" or subevent == "SPELL_AURA_APPLIED" then
    -- covered above
  end

  for _, fn in ipairs(listeners) do
    local ok, err = pcall(fn, fact)
    if not ok then ACL.Diagnostics.add("warn", "clog", tostring(err)) end
  end
end

--- Coarse item/spell category guess; "unknown" is honest, not a pass.
function CombatLog.classifySpell(spellId)
  -- Live spell-to-category mapping requires a catalog; until then we only
  -- tag obvious consumable spell schools when detectable.
  return "unknown"
end

function CombatLog.onFact(fn)
  listeners[#listeners + 1] = fn
end

ACL.CombatLog = CombatLog
