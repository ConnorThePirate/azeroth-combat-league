--[[
  Core/Diagnostics.lua — bounded, redacted diagnostic ring (docs/05).

  Max 500 entries. Never stores names, GUIDs, paths, tokens, or payload bodies
  — tags and short IDs only. Survives reloads through SavedVariables so the
  Test Lab can review what happened before a crash.
]]
local _, ACL = ...

local Diagnostics = {}
local LIMIT = 500

local ring = {}
local function entries()
  if ACL.db and ACL.db.diagnostics then return ACL.db.diagnostics end
  return ring
end

--- Add an entry: level (info|warn|error), tag (module), message (pre-redacted).
function Diagnostics.add(level, tag, message)
  local list = entries()
  list[#list + 1] = {
    t = math.floor((GetServerTime and GetServerTime() or 0)),
    level = level,
    tag = tostring(tag):sub(1, 32),
    msg = tostring(message):sub(1, 160),
  }
  while #list > LIMIT do
    table.remove(list, 1)
  end
end

function Diagnostics.list()
  return entries()
end

function Diagnostics.count()
  return #entries()
end

function Diagnostics.clear()
  local list = entries()
  while #list > 0 do table.remove(list) end
end

ACL.Diagnostics = Diagnostics
