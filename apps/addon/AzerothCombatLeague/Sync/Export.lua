--[[
  Sync/Export.lua — build wf.sync-envelope.v2 payloads and WFP2 text (docs/06, 27).

  Export is memory-based and includes losses; batches respect the 25-report
  and byte limits with deterministic numbering so a multi-batch session can
  resume. The export string is selectable text — WoW cannot write the OS
  clipboard.
]]
local _, ACL = ...

local Export = {}

local function nowMs() return math.floor(GetServerTime() * 1000) end

local function buildInfo()
  local _, build = GetBuildInfo and GetBuildInfo() or nil
  return tostring(build or "?"), tostring(ACL.VERSION or "0.0.0")
end

--- Assemble the sync envelope payload for a set of report records.
function Export.buildPayload(records)
  local build, version = buildInfo()
  local reports = ACL.Json.array({})
  for _, r in ipairs(records) do
    reports[#reports + 1] = r.body
  end
  return {
    schema = "wf.sync-envelope.v2",
    installationId = ACL.db.installationId,
    build = build,
    addonVersion = version,
    exportedAtMs = nowMs(),
    reports = reports,
  }
end

--- Export pending reports as WFP2 text batches (<=25 reports, byte-bounded).
--- Returns {batches={text,...}, totalReports, batchesTotal} or nil,err.
function Export.pendingBatches()
  local pending = ACL.Outbox.pending()
  local batches = {}
  local perBatch = ACL.Limits and 25 or 25
  for i = 1, #pending, perBatch do
    local slice = {}
    for j = i, math.min(i + perBatch - 1, #pending) do
      slice[#slice + 1] = pending[j]
    end
    local text, err = ACL.Codec.encodeExport(Export.buildPayload(slice))
    if not text then return nil, err end
    batches[#batches + 1] = text
  end
  return { batches = batches, totalReports = #pending, batchesTotal = #batches }
end

--- Build a wf.match-report.v2 body from a finished session.
function Export.reportFromSession(session)
  local build, version = buildInfo()
  local self_ = ACL.Identity.self()
  local games = ACL.Json.array({})
  for i, g in pairs(session.games) do
    games[#games + 1] = {
      index = i,
      observedStartMs = g.startMs or ACL.Json.null,
      observedEndMs = g.endMs or ACL.Json.null,
      claimedWinnerCharacterId = g.winner or ACL.Json.null,
      finishReason = g.reason or "unknown",
      facts = ACL.Json.array(g.facts or {}),
      interferenceCandidates = ACL.Json.array(g.interference or {}),
      violationCandidates = ACL.Json.array(g.violations or {}),
    }
  end
  return {
    schema = "wf.match-report.v2",
    sessionId = session.contract.sessionId,
    contractHash = session.contractHash,
    originCharacterId = session.selfCharacterId,
    installationId = ACL.db.installationId,
    nonce = session.nonce or ACL.Uuid.v4(),
    build = build,
    addonVersion = version,
    detectorCatalogVersion = "cat-0",
    proposedAtMs = session.proposedAtMs or ACL.Json.null,
    acceptedAtMs = session.acceptedAtMs or ACL.Json.null,
    startedAtMs = session.startedAtMs or ACL.Json.null,
    finishedAtMs = session.finishedAtMs or ACL.Json.null,
    games = games,
    coverage = ACL.Json.array(session.coverage or {}),
    attestations = ACL.Json.array(session.attestations or {}),
    peerDigests = ACL.Json.array(session.peerDigests or {}),
  }
end

--- Confirm a finished session: build the report and enqueue it.
--- The report persists unsynced until a receipt arrives — Confirm never
--- implies delivery (docs/27 status language).
function Export.confirm(session)
  local report = Export.reportFromSession(session)
  ACL.Outbox.enqueue(report)
  return report.nonce
end

--- Is it safe to reload the UI right now? Reload flushes SavedVariables —
--- that is the ONLY way evidence leaves the client (docs/27).
function Export.safeToReload()
  if InCombatLockdown and InCombatLockdown() then return false, "in combat" end
  if ACL.Duel and ACL.Duel.isActive and ACL.Duel.isActive() then
    return false, "duel in progress"
  end
  return true
end

--- Flush pending evidence to disk by reloading the UI. The companion picks
--- up the SavedVariables file the moment it lands. Returns false,reason
--- when a reload would be unsafe — evidence stays queued in memory.
function Export.flushNow()
  local ok, why = Export.safeToReload()
  if not ok then return false, why end
  ACL.Outbox.trimAcked()
  -- mark pending as on-disk so post-reload state is honest: the record
  -- is in the SavedVariables file, the server just hasn't confirmed yet
  for _, r in ipairs(ACL.Outbox.pending()) do ACL.Outbox.markSaved(r.nonce) end
  ReloadUI()
  return true
end

ACL.Export = Export
