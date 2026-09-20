--[[
  Adapters/PvPMatch.lua — native instanced-PvP probes (docs/04).

  Map/NPC names and UI templates do not prove a queue exists. Until live
  probes pass, every function reports capability status instead of acting.
]]
local _, ACL = ...

local PvPMatch = {}

function PvPMatch.probe()
  local status = ACL.Capabilities.get("native_pvpmatch")
  if status == "unknown" then
    return { available = false, reason = "untested on this build" }
  end
  return { available = status == "tested_pass", status = status }
end

ACL.PvPMatch = PvPMatch
