--[[
  UI/Settings.lua — settings + the Sync panel (docs/05, 12, 27).

  Sync section follows docs/27 exactly:
  - primary action: "Save results & reload" (disabled during combat/active
    duel/unfinished capture — re-enabled when safe)
  - companion mode is a preference, never a live Connected badge
  - Copy results is under Advanced / Recovery
  - Import update applies WFU1 snapshots with honest freshness
]]
local _, ACL = ...

local Settings = {}
local panel

local function L(key) return ACL.L[key] or key end

local function safeToReload()
  return ACL.Export.safeToReload()
end

function Settings.build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints()

  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText(L("syncTitle"))

  -- queue status
  local queue = panel:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  queue:SetPoint("TOPLEFT", 16, -44)
  panel.queue = queue

  local explain = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  explain:SetPoint("TOPLEFT", queue, "BOTTOMLEFT", 0, -2)
  explain:SetText(L("unsyncedExplain"))

  -- sync mode line — a preference, never fake live status
  local mode = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  mode:SetPoint("TOPLEFT", explain, "BOTTOMLEFT", 0, -12)
  panel.mode = mode

  -- primary action
  local saveBtn = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  saveBtn:SetSize(200, 30)
  saveBtn:SetPoint("TOPLEFT", mode, "BOTTOMLEFT", 0, -14)
  saveBtn:SetText(L("saveReload"))
  saveBtn:SetScript("OnClick", function()
    ACL.Export.flushNow()
  end)
  panel.saveBtn = saveBtn

  -- auto-sync: reload automatically after confirming a result (opt-in —
  -- a surprise reload mid-session is worse than a queued report)
  local auto = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
  auto:SetPoint("LEFT", saveBtn, "RIGHT", 10, 0)
  auto.text:SetText("auto after matches")
  auto:SetScript("OnClick", function(b)
    ACL.db.settings.autoSync = b:GetChecked() and true or false
  end)
  panel.autoSync = auto

  -- last imported snapshot freshness
  local snap = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  snap:SetPoint("TOPLEFT", saveBtn, "BOTTOMLEFT", 0, -14)
  panel.snap = snap

  -- advanced/recovery
  local adv = panel:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  adv:SetPoint("TOPLEFT", snap, "BOTTOMLEFT", 0, -22)
  adv:SetText("Advanced / Recovery")

  local copyBtn = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  copyBtn:SetSize(200, 24)
  copyBtn:SetPoint("TOPLEFT", adv, "BOTTOMLEFT", 0, -6)
  copyBtn:SetText(L("copyResults"))
  copyBtn:SetScript("OnClick", function() Settings.showExport() end)
  panel.copyBtn = copyBtn

  local importBtn = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  importBtn:SetSize(200, 24)
  importBtn:SetPoint("LEFT", copyBtn, "RIGHT", 8, 0)
  importBtn:SetText(L("importUpdate"))
  importBtn:SetScript("OnClick", function() Settings.showImport() end)

  -- quiet mode toggle
  local quiet = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
  quiet:SetPoint("TOPLEFT", copyBtn, "BOTTOMLEFT", -4, -16)
  quiet.text:SetText("Quiet mode — suppress hub/event notifications")
  quiet:SetScript("OnClick", function(b)
    ACL.db.settings.quietMode = b:GetChecked() and true or false
  end)
  panel.quiet = quiet

  -- pending-sync badge toggle
  local badge = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
  badge:SetPoint("LEFT", quiet, "RIGHT", 10, 0)
  badge.text:SetText("Show pending-results indicator")
  badge:SetScript("OnClick", function(b)
    ACL.db.settings.syncBadge = b:GetChecked() and true or false
    ACL.UI.SyncBadge.refresh()
  end)
  panel.badge = badge

  -- export/import edit boxes (created lazily)
  return panel
end

local function makeIOBox(name, labelText)
  local f = CreateFrame("Frame", name, panel or UIParent, "BasicFrameTemplateWithInset")
  f:SetSize(440, 220)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:Hide()
  local label = f:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  label:SetPoint("TOP", 0, -32)
  label:SetText(labelText)
  local eb = CreateFrame("EditBox", nil, f, "InputBoxTemplate")
  eb:SetSize(380, 24)
  eb:SetPoint("CENTER", 0, 10)
  eb:SetAutoFocus(false)
  eb:SetMultiLine(false)
  f.box = eb
  local close = CreateFrame("Button", nil, f, "UIPanelButtonTemplate")
  close:SetSize(100, 24)
  close:SetPoint("BOTTOM", 0, 14)
  close:SetText(L("close"))
  close:SetScript("OnClick", function() f:Hide() end)
  return f
end

function Settings.showExport()
  local batches, err = ACL.Export.pendingBatches()
  local f = panel.exportFrame or makeIOBox("ACLExportFrame", "Copy results — Ctrl+A, Ctrl+C")
  panel.exportFrame = f
  if batches and #batches.batches > 0 then
    f.box:SetText(batches.batches[1])
    f.box:HighlightText()
    f.box:SetFocus()
  else
    f.box:SetText("-- nothing queued --")
  end
  f:Show()
end

function Settings.showImport()
  local f = panel.importFrame or makeIOBox("ACLImportFrame", "Paste WFU1 update bundle")
  panel.importFrame = f
  local apply = f.applyBtn
  if not apply then
    apply = CreateFrame("Button", nil, f, "UIPanelButtonTemplate")
    apply:SetSize(100, 24)
    apply:SetPoint("BOTTOM", 108, 14)
    apply:SetText("Import")
    apply:SetScript("OnClick", function()
      local res, err = ACL.Import.apply(f.box:GetText())
      if res then
        f.box:SetText("imported seq " .. res.sequence .. " (" .. res.status .. ")")
      else
        f.box:SetText("rejected: " .. (err and err.code or "?"))
      end
    end)
    f.applyBtn = apply
  end
  f:Show()
end

function Settings.refresh(p)
  panel = p or panel
  if not panel then return end
  local c = ACL.Outbox.counts()
  local pending = c.unsynced + c.saved
  panel.queue:SetText(string.format(L("unsyncedCount"), pending))
  local m = ACL.db.settings.syncMode
  panel.mode:SetText(m == "companion" and L("syncModeCompanion") or L("syncModeLocal"))
  local snap = ACL.db.lastSnapshot
  panel.snap:SetText(snap and string.format(L("lastSnapshot"), "#" .. snap.sequence)
    or L("neverImported"))
  local ok, why = safeToReload()
  if ok then panel.saveBtn:Enable() else panel.saveBtn:Disable() end
  panel.quiet:SetChecked(ACL.db.settings.quietMode)
  panel.autoSync:SetChecked(ACL.db.settings.autoSync)
  panel.badge:SetChecked(ACL.db.settings.syncBadge ~= false)
end

ACL.UI = ACL.UI or {}
ACL.UI.Settings = Settings
