--[[
  UI/Result.lua — post-match result card (docs/05, 12).

  Compact card: outcome, monitoring coverage, flagged issues, and exactly
  three actions — Confirm / Report problem / Rematch. Suppressed by quiet
  mode only when unsolicited; shown immediately after a finish.
]]
local _, ACL = ...

local Result = {}
local card

local function L(key) return ACL.L[key] or key end

function Result.build()
  if card then return card end
  card = CreateFrame("Frame", "ACLResultCard", UIParent, "BasicFrameTemplateWithInset")
  card:SetSize(320, 230)
  card:SetPoint("CENTER", 0, 160)
  card:SetFrameStrata("HIGH")
  card:Hide()

  local outcome = card:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  outcome:SetPoint("TOP", 0, -36)
  card.outcome = outcome

  local detail = card:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  detail:SetPoint("TOP", outcome, "BOTTOM", 0, -6)
  card.detail = detail

  local coverage = card:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  coverage:SetPoint("TOP", detail, "BOTTOM", 0, -10)
  card.coverage = coverage

  local confirm = CreateFrame("Button", nil, card, "UIPanelButtonTemplate")
  confirm:SetSize(90, 24)
  confirm:SetPoint("BOTTOMLEFT", 12, 12)
  confirm:SetText(L("confirm"))

  local problem = CreateFrame("Button", nil, card, "UIPanelButtonTemplate")
  problem:SetSize(110, 24)
  problem:SetPoint("BOTTOM", 0, 12)
  problem:SetText(L("reportProblem"))

  local rematch = CreateFrame("Button", nil, card, "UIPanelButtonTemplate")
  rematch:SetSize(90, 24)
  rematch:SetPoint("BOTTOMRIGHT", -12, 12)
  rematch:SetText(L("rematch"))

  -- confirm + flush: one click confirms the result AND reloads so the
  -- companion can pick it up immediately (the only way data leaves WoW)
  local sync = CreateFrame("Button", nil, card, "UIPanelButtonTemplate")
  sync:SetSize(296, 22)
  sync:SetPoint("BOTTOM", 0, 42)
  sync:SetText("Confirm & upload now")

  local syncNote = card:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  syncNote:SetPoint("BOTTOM", sync, "TOP", 0, 2)

  card.confirmBtn, card.problemBtn, card.rematchBtn = confirm, problem, rematch
  card.syncBtn, card.syncNote = sync, syncNote
  return card
end

--- Show the result card for a finished session.
function Result.show(session)
  Result.build()
  local self_ = ACL.Identity.self()
  local winner = session.series and session.series.winner
  local text, detail
  if not winner then
    text = L("resultUnknown")
    detail = "The addon could not verify the outcome."
  elseif winner == (self_ and self_.characterId) then
    text = L("resultWin")
    detail = "Recorded — awaiting opponent's report."
  else
    text = L("resultLoss")
    detail = "Recorded — awaiting opponent's report."
  end
  card.outcome:SetText(text)
  card.detail:SetText(detail)

  -- monitoring coverage summary (honest: unavailable is not clean)
  local unknown = 0
  local total = 0
  for _ in pairs(session.coverage or {}) do total = total + 1 end
  for _, c in pairs(session.coverage or {}) do
    if c.status == "unavailable" then unknown = unknown + 1 end
  end
  if total == 0 then
    card.coverage:SetText(string.format(L("coverageLabel"), L("unknown")))
  elseif unknown > 0 then
    card.coverage:SetText(string.format(L("coverageLabel"),
      unknown .. "/" .. total .. " unmonitored"))
  else
    card.coverage:SetText(string.format(L("coverageLabel"), "full"))
  end

  local function doConfirm()
    ACL.Export.confirm(session)
    ACL.Dispatch.shareReport(session) -- corroboration copy to the peer
  end
  local function countdown(n)
    card.syncNote:SetText("Syncing in " .. n .. " — press anything to stay")
    if C_Timer and C_Timer.After then
      C_Timer.After(1, function()
        if not card:IsShown() then return end -- player chose to stay
        if n <= 1 then ACL.Export.flushNow() else countdown(n - 1) end
      end)
    else
      ACL.Export.flushNow()
    end
  end
  card.confirmBtn:SetScript("OnClick", function()
    doConfirm()
    if ACL.db.settings.autoSync then countdown(5) else card:Hide() end
  end)
  card.syncBtn:SetScript("OnClick", function()
    doConfirm()
    local ok = ACL.Export.flushNow()
    if not ok then card:Hide() end -- unsafe: report stays queued for later
  end)
  card.problemBtn:SetScript("OnClick", function()
    ACL.Diagnostics.add("info", "result", "problem flagged " .. session.contract.sessionId)
    card:Hide()
    ACL.UI.Shell.show("Matches")
  end)
  card.rematchBtn:SetScript("OnClick", function()
    card:Hide()
    ACL.Events.emit("rematch.requested", session)
  end)

  card:Show()
end

ACL.UI = ACL.UI or {}
ACL.UI.Result = Result
