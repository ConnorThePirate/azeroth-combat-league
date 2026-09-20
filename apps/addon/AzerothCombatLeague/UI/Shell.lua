--[[
  UI/Shell.lua — main window and tab shell (docs/05).

  One movable window, seven tabs matching docs/05 UI list plus Test Lab.
  Quiet mode suppresses unsolicited popups; the window itself only opens on
  explicit player action (slash command, minimap button, or duel flow).
]]
local _, ACL = ...

local Shell = {}
local frame = nil
local tabs = {}
local panels = {}
local activeTab = nil

local TAB_ORDER = { "Challenge", "Matches", "Rules", "Hub", "Events", "Sync", "Settings", "Lab" }
local TAB_LABEL = {
  Challenge = "tabChallenge", Matches = "tabMatches", Rules = "tabRules",
  Hub = "tabHub", Events = "tabEvents", Sync = "tabSync",
  Settings = "tabSettings", Lab = "tabLab",
}
local TAB_PANEL = {
  Challenge = "Challenge", Matches = "History", Rules = "RulesEditor",
  Hub = "Hub", Events = "Event", Sync = "Settings", Settings = "Settings", Lab = "TestLab",
}

local function L(key) return ACL.L[key] or key end

local function makeButton(parent, text)
  local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  b:SetText(text)
  return b
end

local function makeTab(parent, key, index)
  local b = makeButton(parent, L(TAB_LABEL[key]))
  b:SetSize(86, 22)
  b:SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", 8 + (index - 1) * 90, -26)
  b:SetScript("OnClick", function() Shell.showTab(key) end)
  tabs[key] = b
  return b
end

function Shell.init()
  if frame then return end
  frame = CreateFrame("Frame", "ACLMainFrame", UIParent, "BasicFrameTemplateWithInset")
  frame:SetSize(620, 440)
  frame:SetPoint("CENTER")
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
  frame:SetFrameStrata("DIALOG")
  frame:SetClampedToScreen(true)
  frame:Hide()
  if frame.TitleText then frame.TitleText:SetText(L("addonTitle")) end
  tinsert(UISpecialFrames, "ACLMainFrame")

  -- panel host
  local host = CreateFrame("Frame", nil, frame)
  host:SetPoint("TOPLEFT", 8, -28)
  host:SetPoint("BOTTOMRIGHT", -8, 36)
  frame.host = host

  for i, key in ipairs(TAB_ORDER) do makeTab(frame, key, i) end

  -- build panels lazily on first show
  ACL.Events.subscribe("ui.showTab", function(key) Shell.showTab(key) end)
end

local function panelFor(key)
  local name = TAB_PANEL[key] or key
  local mod = ACL.UI and ACL.UI[name]
  if not mod then return nil end
  if not panels[name] and mod.build then
    panels[name] = mod.build(frame.host)
    if panels[name] then panels[name]:Hide() end
  end
  return panels[name]
end

function Shell.showTab(key)
  if not frame then return end
  activeTab = key
  for k, p in pairs(panels) do
    if p then p:Hide() end
  end
  local p = panelFor(key)
  if p then
    p:Show()
    local mod = ACL.UI and ACL.UI[TAB_PANEL[key] or key]
    if mod and mod.refresh then pcall(mod.refresh, p) end
  end
end

function Shell.toggle()
  if not frame then return end
  if frame:IsShown() then frame:Hide() else Shell.show("Challenge") end
end

function Shell.show(tab)
  if not frame then return end
  frame:Show()
  Shell.showTab(tab or activeTab or "Challenge")
end

ACL.UI = ACL.UI or {}
ACL.UI.Shell = Shell
