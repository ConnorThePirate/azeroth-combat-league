--[[
  Adapters/Inspect.lua — equipment snapshot during ready checks (docs/08).

  Inspection is capability-gated: if the client does not offer a usable
  inspect path the coverage reports "unavailable" and the UI says so.
]]
local _, ACL = ...

local Inspect = {}

--- Snapshot equipment for a unit. Returns {items={slot->itemId}, coverage}.
function Inspect.snapshot(unit)
  local out = { items = {}, coverage = "unavailable" }
  if not (GetInventoryItemID and UnitExists and UnitExists(unit)) then
    return out
  end
  out.coverage = "observable"
  for slot = 1, 19 do
    local id = GetInventoryItemID(unit, slot)
    if id then out.items[slot] = id end
  end
  return out
end

ACL.Inspect = Inspect
