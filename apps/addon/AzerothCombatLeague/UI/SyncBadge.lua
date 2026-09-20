--[[
  UI/SyncBadge.lua — persistent pending-sync indicator (docs/05, 27 UX).

  A small chip that exists only while unacknowledged results do — hidden
  otherwise, so a healthy install shows nothing at all. Clicking flushes
  via ReloadUI when safe (the companion uploads the moment SavedVariables
  land). Right-click dismisses until a NEW result arrives — it reappears
  rather than letting evidence sit forgotten.

  Wording distinguishes memory-only (crash-risk) from on-disk records —
  "saved" still means "the server hasn't confirmed", never "uploaded".
]]
local _, ACL = ...

local Badge = {}
local frame = nil
local dismissedAt = 0   -- hide while pending <= this; new results re-show
local nudged = false    -- one memory-risk reminder per pile-up

-- memory-only results die with the game if it crashes; nudge at this pile
local NUDGE_AT = 3

local function L(key) return ACL.L[key] or key end

local function counts()
  local c = ACL.Outbox.counts()
  return c.unsynced + c.saved, c
end

local function savePos(f)
  if f.GetLeft and f.GetBottom then
    local ok, x, y = pcall(function() return f:GetLeft(), f:GetBottom() end)
    if ok and x and y then
      ACL.db.settings.badgePos = { x = x, y = y }
    end
  end
end

function Badge.init()
  if frame then Badge.refresh(); return end
  frame = CreateFrame("Button", "ACLSyncBadge", UIParent,
    BackdropTemplateMixin and "BackdropTemplate" or nil)
  frame:SetSize(150, 24)
  local pos = ACL.db.settings.badgePos
  if pos and pos.x then
    frame:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", pos.x, pos.y)
  else
    frame:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -60, 240)
  end
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetFrameStrata("MEDIUM")
  frame:SetClampedToScreen(true)
  if frame.SetBackdrop then
    frame:SetBackdrop({ bgFile = "Interface/ChatFrame/ChatFrameBackground",
      edgeFile = "Interface/Tooltips/UI-Tooltip-Border", edgeSize = 12 })
    frame:SetBackdropColor(0, 0, 0, 0.7)
    frame:SetBackdropBorderColor(0.9, 0.7, 0.2, 1)
  end
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", function(f)
    f:StopMovingOrSizing()
    savePos(f)
  end)

  local text = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  text:SetPoint("CENTER")
  frame.text = text

  frame:SetScript("OnClick", function(_, button)
    if button == "RightButton" then
      dismissedAt = counts()
      Badge.refresh()
      return
    end
    local ok, why = ACL.Export.flushNow()
    if not ok then
      DEFAULT_CHAT_FRAME:AddMessage(
        string.format(L("badgeCantSync"), tostring(why)))
    end
    -- reload happened (or report stays queued) — either way refresh ran
  end)

  frame:SetScript("OnEnter", function(f)
    if not (GameTooltip and GameTooltip.SetOwner) then return end
    GameTooltip:SetOwner(f, "ANCHOR_TOP")
    GameTooltip:AddLine(L("badgeTipTitle"))
    local _, c = counts()
    if c.unsynced > 0 then
      GameTooltip:AddLine(string.format(L("badgeTipUnsynced"), c.unsynced),
        1, 0.6, 0.3, true)
    end
    if c.saved > 0 then
      GameTooltip:AddLine(string.format(L("badgeTipSaved"), c.saved),
        0.9, 0.9, 0.9, true)
    end
    GameTooltip:AddLine(L("badgeTipDismiss"), 0.5, 0.5, 0.5, true)
    GameTooltip:Show()
  end)
  frame:SetScript("OnLeave", function()
    if GameTooltip then GameTooltip:Hide() end
  end)

  frame:Hide()
  ACL.Events.subscribe("outbox.changed", function() Badge.refresh() end)
  Badge.refresh()
end

function Badge.refresh()
  if not frame then return end
  local n, c = counts()
  if n == 0 then
    dismissedAt = 0
    nudged = false
    frame:Hide()
    return
  end
  -- crash loses memory-only results; nudge once when they pile up.
  -- quietMode players still get it — this is evidence safety, not chatter.
  if c.unsynced >= NUDGE_AT and not nudged then
    nudged = true
    if DEFAULT_CHAT_FRAME then
      DEFAULT_CHAT_FRAME:AddMessage(string.format(L("badgeNudge"), c.unsynced))
    end
  end
  if c.unsynced == 0 then nudged = false end
  if ACL.db.settings.syncBadge == false or n <= dismissedAt then
    frame:Hide()
    return
  end
  if c.unsynced > 0 then
    frame.text:SetText(string.format(L("badgePendingMemory"), c.unsynced))
  else
    frame.text:SetText(string.format(L("badgePendingSaved"), n))
  end
  frame:Show()
end

ACL.UI = ACL.UI or {}
ACL.UI.SyncBadge = Badge
