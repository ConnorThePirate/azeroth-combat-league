--[[
  UI/RulesEditor.lua — rules browser/presets (docs/05, 08, 12).

  Preset-first; shows each template's rule summary and monitoring coverage
  honestly. The full builder (item/category exceptions, phases, share codes)
  is a website surface — the addon applies presets and displays diffs.
]]
local _, ACL = ...

local RulesEditor = {}
local panel

local function L(key) return ACL.L[key] or key end

function RulesEditor.build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints()

  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText(L("tabRules"))

  local rows = {}
  local y = -52
  for key, tmpl in pairs(ACL.Rules.TEMPLATES) do
    local row = panel:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    row:SetPoint("TOPLEFT", 16, y)
    local badge = tmpl.ratedEligible and "|cff55ff55[rated]|r " or ""
    row:SetText(badge .. tmpl.label .. " — " .. tmpl.description)
    y = y - 20
    rows[#rows + 1] = row
  end

  local note = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  note:SetPoint("TOPLEFT", 16, y - 8)
  note:SetText("Only the exact Standard version rates globally. Custom changes\n" ..
    "are fine for casual and event play — they simply never feed the ladder.")
  return panel
end

function RulesEditor.refresh(p) panel = p or panel end

ACL.UI = ACL.UI or {}
ACL.UI.RulesEditor = RulesEditor
