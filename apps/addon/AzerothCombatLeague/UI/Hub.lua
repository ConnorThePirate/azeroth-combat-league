--[[
  UI/Hub.lua — local hub board (docs/05).

  Hub presence rides the tested local addon transport with short expiry —
  never a fake global matchmaking feed. Until presence transport is proven
  on this client the panel shows the capability status plainly.
]]
local _, ACL = ...

local Hub = {}
local panel

function Hub.build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints()
  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText("Local hub")
  local body = panel:CreateFontString(nil, "OVERLAY", "GameFontDisable")
  body:SetPoint("TOPLEFT", 16, -44)
  body:SetWidth(540)
  body:SetJustifyH("LEFT")
  body:SetText("The hub lists players nearby who are looking for fights.\n\n" ..
    "Presence transport hasn't been verified on this client yet — " ..
    "the Test Lab tracks that probe.")
  return panel
end

function Hub.refresh(p) panel = p or panel end

ACL.UI = ACL.UI or {}
ACL.UI.Hub = Hub
