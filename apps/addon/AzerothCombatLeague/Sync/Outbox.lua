--[[
  Sync/Outbox.lua — report persistence and queue (docs/05, 27).

  Reports persist in SavedVariables until acknowledged. Acknowledged
  completed reports keep to 100 by default; unsynced records are NEVER
  trimmed — at the soft cap the UI warns and offers export instead.
]]
local _, ACL = ...

local Outbox = {}

local function nowMs() return math.floor(GetServerTime() * 1000) end

--- Store a completed match report record.
function Outbox.enqueue(report)
  local db = ACL.db
  db.reports[report.nonce] = {
    nonce = report.nonce,
    sessionId = report.sessionId,
    contractHash = report.contractHash,
    body = report,
    status = "unsynced",      -- unsynced | saved | received | acked
    createdAtMs = nowMs(),
  }
  db.reportOrder[#db.reportOrder + 1] = report.nonce
  ACL.Events.emit("outbox.changed")
  return report.nonce
end

--- Mark persisted (SavedVariables flush happened / is assumed after reload).
function Outbox.markSaved(nonce)
  local r = ACL.db.reports[nonce]
  if r and r.status == "unsynced" then r.status = "saved" end
end

--- Apply a receipt status from the website (via WFU1 or companion view).
function Outbox.applyReceipt(nonce, status, receiptId)
  local r = ACL.db.reports[nonce]
  if not r then return false end
  -- display status only; never deletes the report (docs/27)
  r.receiptStatus = status
  r.receiptId = receiptId
  if status == "accepted" or status == "corroborated" or status == "rating_pending"
      or status == "duplicate" then
    r.status = "acked"
  end
  ACL.Events.emit("outbox.changed")
  return true
end

function Outbox.pending()
  local out = {}
  for _, nonce in ipairs(ACL.db.reportOrder) do
    local r = ACL.db.reports[nonce]
    if r and (r.status == "unsynced" or r.status == "saved") then
      out[#out + 1] = r
    end
  end
  return out
end

function Outbox.counts()
  local unsynced, saved, acked = 0, 0, 0
  for _, r in pairs(ACL.db.reports) do
    if r.status == "unsynced" then unsynced = unsynced + 1
    elseif r.status == "saved" then saved = saved + 1
    elseif r.status == "acked" then acked = acked + 1 end
  end
  return { unsynced = unsynced, saved = saved, acked = acked }
end

--- Trim acknowledged history beyond retention; never touches unsynced.
function Outbox.trimAcked()
  local db = ACL.db
  local acked = {}
  for _, nonce in ipairs(db.reportOrder) do
    local r = db.reports[nonce]
    if r and r.status == "acked" then acked[#acked + 1] = nonce end
  end
  local excess = #acked - ACL.State.ACKED_REPORT_RETENTION
  if excess <= 0 then return 0 end
  local removed = {}
  for i = 1, excess do removed[acked[i]] = true end
  local newOrder = {}
  for _, nonce in ipairs(db.reportOrder) do
    if removed[nonce] then db.reports[nonce] = nil
    else newOrder[#newOrder + 1] = nonce end
  end
  db.reportOrder = newOrder
  return excess
end

ACL.Outbox = Outbox
