--[[
  UI/TestLab.lua — beta lab panel (docs/30 deliverable 1).

  Build/capability summary, scenario checklist, bounded diagnostics, and a
  one-click session bundle export (automatic journal) that testers hand to
  the companion — never transcribing outcomes by hand.
]]
local _, ACL = ...

local TestLab = {}
local panel

local function L(key) return ACL.L[key] or key end

local STATUS_COLOR = {
  tested_pass = "|cff55ff55", partial = "|cffffcc00", fail = "|cffff5555",
  observed_source = "|cff88ccff", unknown = "|cff888888",
}

function TestLab.build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints()

  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText(L("tabLab"))

  local build = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  build:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)
  panel.build = build

  panel.rows = {}
  local sorted = {}
  for id in pairs(ACL.Capabilities.CATALOG) do sorted[#sorted + 1] = id end
  table.sort(sorted)
  for i, id in ipairs(sorted) do
    local row = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    row:SetPoint("TOPLEFT", 16, -66 - i * 16)
    panel.rows[i] = row
    row.capId = id
  end

  local export = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  export:SetSize(160, 26)
  export:SetPoint("BOTTOMLEFT", 16, 16)
  export:SetText(L("labExport"))
  export:SetScript("OnClick", function() TestLab.exportBundle() end)

  local probes = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  probes:SetSize(160, 26)
  probes:SetPoint("LEFT", export, "RIGHT", 8, 0)
  probes:SetText(L("labRunProbes"))
  probes:SetScript("OnClick", function()
    ACL.Probes.runPassive()
    TestLab.refresh(panel)
  end)
  return panel
end

function TestLab.refresh(p)
  panel = p or panel
  if not panel then return end
  local v, b = GetBuildInfo and GetBuildInfo() or "?", "?"
  panel.build:SetText("build " .. tostring(v) .. " (" .. tostring(b) .. ")  ·  " ..
    "addon " .. tostring(ACL.VERSION or "?") .. "  ·  " ..
    tostring(ACL.Diagnostics.count()) .. " diagnostics")
  for _, row in ipairs(panel.rows) do
    local status, rec = ACL.Capabilities.get(row.capId)
    local color = STATUS_COLOR[status] or "|cff888888"
    local desc = ACL.Capabilities.CATALOG[row.capId]
    row:SetText(color .. status .. "|r  " .. row.capId)
    if rec and rec.notes then
      row:SetText(color .. status .. "|r  " .. row.capId .. "  |cff666666" .. rec.notes .. "|r")
    end
  end
end

local bundleFrame = nil

--- Automatic session bundle: diagnostics + capabilities + pending reports.
function TestLab.exportBundle()
  local v, b = GetBuildInfo and GetBuildInfo() or "?", "?"
  local caps = {}
  for id, rec in pairs(ACL.Capabilities.all()) do
    caps[#caps + 1] = { id = id, status = rec.status,
      build = rec.record and rec.record.build or ACL.Json.null,
      observedAtMs = rec.record and rec.record.observedAtMs or 0 }
  end
  local bundle = {
    schema = "acl.lab-bundle.v0",
    installationId = ACL.db.installationId,
    addonVersion = tostring(ACL.VERSION or "?"),
    build = tostring(b),
    exportedAtMs = math.floor(GetServerTime() * 1000),
    capabilities = ACL.Json.array(caps),
    diagnostics = ACL.Json.array(ACL.Diagnostics.list()),
    pendingReports = ACL.Outbox.counts().unsynced + ACL.Outbox.counts().saved,
  }
  local text = ACL.Codec.encodeExport(bundle)
  if not bundleFrame then
    bundleFrame = CreateFrame("Frame", "ACLLabBundle", UIParent, "BasicFrameTemplateWithInset")
    bundleFrame:SetSize(440, 200)
    bundleFrame:SetPoint("CENTER")
    bundleFrame:SetFrameStrata("DIALOG")
    local label = bundleFrame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    label:SetPoint("TOP", 0, -32)
    label:SetText("Lab bundle — Ctrl+A, Ctrl+C")
    local eb = CreateFrame("EditBox", nil, bundleFrame, "InputBoxTemplate")
    eb:SetSize(380, 24)
    eb:SetPoint("CENTER")
    eb:SetAutoFocus(false)
    bundleFrame.box = eb
    local close = CreateFrame("Button", nil, bundleFrame, "UIPanelButtonTemplate")
    close:SetSize(100, 24)
    close:SetPoint("BOTTOM", 0, 14)
    close:SetText(L("close"))
    close:SetScript("OnClick", function() bundleFrame:Hide() end)
  end
  if text then
    bundleFrame.box:SetText(text)
    bundleFrame.box:HighlightText()
    bundleFrame.box:SetFocus()
  else
    bundleFrame.box:SetText("-- export failed --")
  end
  bundleFrame:Show()
end

ACL.UI = ACL.UI or {}
ACL.UI.TestLab = TestLab
