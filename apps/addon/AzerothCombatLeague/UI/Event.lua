--[[
  UI/Event.lua — community events panel (docs/05, 29).

  Shows imported event data (fight nights, tournaments) with explicit
  freshness. Website data arrives via WFU1 snapshots — dated, never fake-live.
]]
local _, ACL = ...

local Event = {}
local panel

function Event.build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints()
  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText("Events")
  local body = panel:CreateFontString(nil, "OVERLAY", "GameFontDisable")
  body:SetPoint("TOPLEFT", 16, -44)
  body:SetWidth(540)
  body:SetJustifyH("LEFT")
  panel.body = body
  return panel
end

function Event.refresh(p)
  panel = p or panel
  if not panel then return end
  local snap = ACL.db.lastSnapshot
  if snap then
    panel.body:SetText("Event data comes from website update bundles.\nLast imported: update #" ..
      tostring(snap.sequence))
  else
    panel.body:SetText("No event data yet. Import an update bundle from the\n" ..
      "website to see upcoming fight nights (optional).")
  end
end

ACL.UI = ACL.UI or {}
ACL.UI.Event = Event
