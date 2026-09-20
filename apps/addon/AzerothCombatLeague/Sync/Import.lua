--[[
  Sync/Import.lua — apply WFU1 addon-update bundles (docs/06, 27).

  Applies receipts and ladder snapshots as LAST-KNOWN display data only —
  never ownership proof, never authoritative rating. A corrupt or
  account-mismatched bundle leaves the existing snapshot untouched. Snapshot
  sequence is monotonic per account; equal sequence reports
  "already imported"; a newer page upserts included records without erasing
  earlier pages.
]]
local _, ACL = ...

local Import = {}

local function nowMs() return math.floor(GetServerTime() * 1000) end

--- Import a WFU1 string. Returns a result summary or nil,err.
function Import.apply(envelopeText)
  local update, err = ACL.Codec.decodeUpdate(envelopeText)
  if not update then return nil, err end
  if update.schema ~= "wf.addon-update.v1" then
    return nil, { code = "bad_tag", message = "not an addon-update bundle" }
  end
  if type(update.snapshotSequence) ~= "number" or update.snapshotSequence < 1 then
    return nil, { code = "invalid_field", message = "bad snapshot sequence" }
  end

  local db = ACL.db
  -- account binding: the bundle must match the account this install is
  -- enrolled to (set during companion/website pairing); unenrolled installs
  -- record the first seen account for display but do not treat it as proof.
  if db.accountId and update.accountId ~= db.accountId then
    return nil, { code = "account_mismatch", message = "bundle is for a different account" }
  end

  local last = db.lastSnapshot
  if last and update.accountId == last.accountId
      and update.snapshotSequence < last.sequence then
    return nil, { code = "stale_snapshot", message = "older than the last imported update" }
  end
  if last and update.accountId == last.accountId
      and update.snapshotSequence == last.sequence then
    return { status = "already_imported", sequence = update.snapshotSequence }
  end

  -- upsert receipts (bounded to 25 per bundle)
  local receiptCount = 0
  for _, r in ipairs(update.receipts or {}) do
    if receiptCount >= 25 then break end
    if r.installationId == db.installationId then
      ACL.Outbox.applyReceipt(r.nonce, r.status, r.receiptId)
      receiptCount = receiptCount + 1
    end
  end

  -- upsert ladder snapshots per character
  local snapCount = 0
  db.ladderSnapshots = db.ladderSnapshots or {}
  for _, ch in ipairs(update.characters or {}) do
    if snapCount >= 100 then break end
    local cid = ch.characterId
    if cid then
      db.ladderSnapshots[cid] = db.ladderSnapshots[cid] or {}
      for _, snap in ipairs(ch.ladders or {}) do
        db.ladderSnapshots[cid][snap.seasonId .. "|" .. snap.poolId .. "|" .. snap.ladder] = {
          ratingMilli = snap.ratingMilli,
          placementSeries = snap.placementSeries,
          placementOpponents = snap.placementOpponents,
          generationId = snap.generationId,
        }
        snapCount = snapCount + 1
      end
    end
  end

  -- upsert published rulesets (bounded, data-only, each validated)
  local rulesetCount = 0
  db.publishedRulesets = db.publishedRulesets or {}
  for _, rs in ipairs(update.rulesets or {}) do
    if rulesetCount >= 16 then break end
    local clean = ACL.Rules.validatePublished(rs)
    if clean then
      -- versionId-keyed: a newer version of the same ruleset is a new row;
      -- the picker shows the newest published version per ruleset
      local prev = nil
      for _, existing in pairs(db.publishedRulesets) do
        if existing.rulesetId == clean.rulesetId
            and existing.version > clean.version then
          prev = existing
        end
      end
      if not prev then
        -- remove superseded versions of the same ruleset
        for vid, existing in pairs(db.publishedRulesets) do
          if existing.rulesetId == clean.rulesetId then
            db.publishedRulesets[vid] = nil
          end
        end
        db.publishedRulesets[clean.versionId] = clean
        rulesetCount = rulesetCount + 1
      end
    else
      ACL.Diagnostics.add("warn", "import", "dropped invalid published ruleset")
    end
  end

  db.lastSnapshot = {
    accountId = update.accountId,
    sequence = update.snapshotSequence,
    issuedAtMs = update.issuedAtMs,
    importedAtMs = nowMs(),
  }
  ACL.Events.emit("import.applied", update)
  return {
    status = "imported",
    sequence = update.snapshotSequence,
    receipts = receiptCount,
    ladderSnapshots = snapCount,
    rulesets = rulesetCount,
  }
end

--- Apply the companion-staged payload (Data/Inbound.lua) once, by digest.
--- Called at ADDON_LOADED: the file is only read at load time, so the
--- companion writes it after each upload and the next reload picks it up.
--- Re-applying the same payload is skipped by sha256 digest.
function Import.applyPending()
  local payload = rawget(_G, "ACL_INBOUND_PAYLOAD")
  if type(payload) ~= "string" or #payload == 0 then return nil end
  if not payload:match("^WFU1:") then return nil end
  local digest = ACL.Sha256.hex(payload)
  if ACL.db.lastInboundDigest == digest then return nil end -- already applied
  local res, err = Import.apply(payload)
  if res then
    ACL.db.lastInboundDigest = digest
    ACL.Diagnostics.add("info", "import", string.format(
      "auto-import seq %s: %d receipts, %d rulesets",
      tostring(res.sequence), res.receipts or 0, res.rulesets or 0))
    return res
  end
  -- corrupt/mismatched payload: record but don't loop — digest marks it seen
  ACL.db.lastInboundDigest = digest
  ACL.Diagnostics.add("warn", "import",
    "staged update rejected: " .. (err and err.code or "?"))
  return nil
end

--- Last-known rating for display; nil when nothing imported yet.
function Import.lastKnownRating(characterId, seasonId, poolId, ladder)
  local per = ACL.db.ladderSnapshots and ACL.db.ladderSnapshots[characterId]
  if not per then return nil end
  return per[seasonId .. "|" .. poolId .. "|" .. ladder]
end

ACL.Import = Import
