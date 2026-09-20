--[[
  Core/Capabilities.lua — capability registry per docs/04.

  Every game-dependent behavior is gated by a recorded capability status:
    unknown          — never measured on this build
    observed_source  — seen in source snapshot, not tested live
    tested_pass      — verified on the live client
    partial          — works in some contexts
    fail             — tested and does not work
  Nothing claims live support from source inspection alone. UI surfaces this
  honestly; unknown is not treated as working.
]]
local _, ACL = ...

local Capabilities = {}

Capabilities.STATUS = {
  unknown = true, observed_source = true, tested_pass = true,
  partial = true, fail = true,
}

-- Catalog of capabilities the addon can measure. Each starts unknown.
Capabilities.CATALOG = {
  duel_events = "DUEL_REQUESTED/INBOUNDS/OUTOFBOUNDS/FINISHED signals",
  duel_winner_message = "localized duel winner system message",
  combat_log = "COMBAT_LOG_EVENT_UNFILTERED readability",
  combat_log_restricted = "combat log restriction state",
  addon_whisper = "SendAddonMessage WHISPER transport",
  addon_party = "SendAddonMessage PARTY transport",
  addon_cross_faction = "addon messages across factions",
  aura_read = "unit aura enumeration",
  inspect_ready = "inspect/equipment snapshot in ready phase",
  map_area = "zone/map/area ids",
  sv_flush_reload = "SavedVariables flush on /reload",
  sv_flush_logout = "SavedVariables flush on logout",
  peer_receipts = "signed peer receipt carry",
}

local function store()
  if ACL.db then return ACL.db.capabilities end
  ACL._capabilitiesMem = ACL._capabilitiesMem or {}
  return ACL._capabilitiesMem
end

--- Record an observation. status must be one of Capabilities.STATUS.
function Capabilities.report(id, status, notes)
  assert(Capabilities.STATUS[status], "bad capability status " .. tostring(status))
  local _, build = GetBuildInfo and GetBuildInfo() or nil, nil
  store()[id] = {
    status = status,
    build = select(2, GetBuildInfo and GetBuildInfo() or function() end) or "?",
    observedAtMs = math.floor((GetServerTime and GetServerTime() or 0) * 1000),
    notes = notes and tostring(notes):sub(1, 120) or nil,
  }
  ACL.Events.emit("capability", id, status)
end

function Capabilities.get(id)
  local c = store()[id]
  return c and c.status or "unknown", c
end

--- True only for tested_pass/partial — source observations never enable.
function Capabilities.enabled(id)
  local s = Capabilities.get(id)
  return s == "tested_pass" or s == "partial"
end

function Capabilities.all()
  local out = {}
  for id, desc in pairs(Capabilities.CATALOG) do
    local status, rec = Capabilities.get(id)
    out[id] = { status = status, description = desc, record = rec }
  end
  return out
end

ACL.Capabilities = Capabilities
