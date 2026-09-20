--[[
  UI/History.lua — local match history (docs/05, 12).

  Shows recorded matches with honest sync state per docs/27 language:
  Recorded locally / Saved for upload / Received by website / Awaiting
  opponent / Under review / Rated. Never fabricates rating deltas.
]]
local _, ACL = ...

local History = {}
local panel
local ROWS = 14

local function L(key) return ACL.L[key] or key end

local STATUS_LABEL = {
  unsynced = "stateRecorded",
  saved = "stateSaved",
  acked = "stateReceived",
}

function History.build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints()

  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText(L("tabMatches"))

  panel.rows = {}
  for i = 1, ROWS do
    local row = panel:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    row:SetPoint("TOPLEFT", 16, -28 - i * 18)
    row:SetWidth(560)
    row:SetJustifyH("LEFT")
    panel.rows[i] = row
  end

  local empty = panel:CreateFontString(nil, "OVERLAY", "GameFontDisable")
  empty:SetPoint("CENTER")
  empty:SetText("No recorded matches yet.\nChallenge a player to get started.")
  panel.empty = empty
  return panel
end

function History.refresh(p)
  panel = p or panel
  if not panel then return end
  local order = ACL.db.reportOrder
  local n = 0
  -- newest first
  for i = #order, 1, -1 do
    local r = ACL.db.reports[order[i]]
    if r and n < ROWS then
      n = n + 1
      local status = L(STATUS_LABEL[r.status] or "stateRecorded")
      local winner = "?"
      if r.body and r.body.games and r.body.games[1] then
        winner = r.body.games[1].claimedWinnerCharacterId or "?"
        winner = winner:sub(1, 8)
      end
      panel.rows[n]:SetText(string.format("%s  ·  %s  ·  winner %s…",
        (r.sessionId or "?"):sub(1, 8), status, winner))
    end
  end
  for i = n + 1, ROWS do panel.rows[i]:SetText("") end
  panel.empty:SetShown(n == 0)
end

ACL.UI = ACL.UI or {}
ACL.UI.History = History
