--[[
  Adapters/Map.lua — venue/location facts (docs/06 contract venue field).

  Only ordinary zone/map APIs; no invented layer APIs — layer labels are
  player-provided text only.
]]
local _, ACL = ...

local Map = {}

function Map.currentVenue()
  local venue = { kind = "anywhere", mapId = ACL.Json.null, areaId = ACL.Json.null }
  if C_Map and C_Map.GetBestMapForUnit then
    local m = C_Map.GetBestMapForUnit("player")
    if m then
      venue.kind = "map"
      venue.mapId = m
    end
  end
  return venue
end

function Map.zoneLabel()
  local zone = GetZoneText and GetZoneText() or "?"
  local sub = GetSubZoneText and GetSubZoneText() or ""
  if sub ~= "" then return zone .. " — " .. sub end
  return zone
end

ACL.Map = Map
