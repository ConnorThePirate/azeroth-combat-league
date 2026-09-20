--[[
  Domain/Identity.lua — local character identity (docs/26).

  The addon mints one stable UUID per game GUID on first use — a collision
  identifier, never proof of ownership. Server-side enrollment (witnessed or
  provider-verified) binds that UUID to an account. Battle.net identities
  never appear here; no OAuth data touches addon files.
]]
local _, ACL = ...

local Identity = {}

local function nowMs()
  return math.floor((GetServerTime and GetServerTime() or 0) * 1000)
end

--- Stable characterId for a GUID; minted once, persisted in SavedVariables.
function Identity.characterIdForGuid(guid, displayName)
  if not guid then return nil end
  local bundle = ACL.db.publicIdentityBundle
  local rec = bundle[guid]
  if not rec then
    rec = { characterId = ACL.Uuid.v4(), firstSeenMs = nowMs() }
    bundle[guid] = rec
  end
  if displayName then rec.displayName = displayName end
  return rec.characterId
end

function Identity.self()
  local guid = UnitGUID and UnitGUID("player") or nil
  if not guid then return nil end
  local name = UnitName and UnitName("player") or nil
  local _, _, classId = UnitClass and UnitClass("player") or nil
  local level = UnitLevel and UnitLevel("player") or 0
  return {
    guid = guid,
    characterId = Identity.characterIdForGuid(guid, name),
    name = name,
    classId = classId,
    level = level,
  }
end

--- Resolve a unit token (e.g. "target") to a character identity.
function Identity.forUnit(unit)
  if not UnitExists or not UnitExists(unit) then return nil end
  if not (UnitIsPlayer and UnitIsPlayer(unit)) then return nil end
  local guid = UnitGUID(unit)
  local name = UnitName(unit)
  local _, _, classId = UnitClass(unit)
  return {
    guid = guid,
    characterId = Identity.characterIdForGuid(guid, name),
    name = name,
    classId = classId,
    level = UnitLevel and UnitLevel(unit) or 0,
  }
end

ACL.Identity = Identity
