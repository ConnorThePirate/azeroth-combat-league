--[[
  Core/State.lua — SavedVariables schema, defaults, migrations (docs/05).

  SavedVariables global: AzerothCombatLeagueDB (account-wide).
  Holds schemaVersion, installationId, settings, publicIdentityBundle,
  capabilities, contracts, reports, outbox, receipts, diagnostics,
  characters, ladderSnapshots. Retention: 100 acknowledged completed reports;
  unsynced records are never trimmed. Migrations keep a backup of the prior
  schema and never erase unsynced evidence.
]]
local _, ACL = ...

local State = {}

State.SCHEMA_VERSION = 1
State.ACKED_REPORT_RETENTION = 100

function State.defaults()
  return {
    schemaVersion = State.SCHEMA_VERSION,
    installationId = nil,          -- minted on first run (collision id, not auth)
    settings = {
      quietMode = false,
      syncMode = "unset",          -- unset | companion | carrier | local
      rulesetPreset = "standard",
      bestOf = 3,
      autoSync = false,            -- opt-in: reload to flush after a match ends
      syncBadge = true,            -- pending-results indicator chip
      badgePos = nil,              -- {x,y} if the player dragged the badge
    },
    publicIdentityBundle = {},     -- guid -> {characterId, displayName}
    config = {},                   -- server-issued ids (seasonId/poolId/rulesetVersionId) via WFU1
    capabilities = {},             -- capabilityId -> {status, observedAtMs, build, notes}
    contracts = {},                -- sessionId -> contract + local lifecycle
    reports = {},                  -- nonce -> report record (outbox + history)
    reportOrder = {},              -- nonce list, insertion order
    outbox = {},                   -- messageId -> {payload, queuedAtMs, attempts}
    receipts = {},                 -- nonce -> {status, receiptId, seenAtMs}
    publishedRulesets = {},        -- versionId -> published ruleset (server data, read-only)
    lastInboundDigest = nil,       -- sha256 of last applied companion payload
    diagnostics = {},
    sessions = {},                 -- sessionId -> local session state
    lastSnapshot = nil,            -- {sequence, issuedAtMs, accountId}
  }
end

--- Initialize or migrate the SavedVariables table. Called on ADDON_LOADED.
function State.init()
  local db = rawget(_G, "AzerothCombatLeagueDB")
  if type(db) ~= "table" then
    db = State.defaults()
    _G.AzerothCombatLeagueDB = db
  end
  if db.schemaVersion ~= State.SCHEMA_VERSION then
    State.migrate(db)
  end
  -- fill any missing keys from defaults (forward-compatible repair)
  for k, v in pairs(State.defaults()) do
    if db[k] == nil then db[k] = v end
  end
  if not ACL.Uuid.isValid(db.installationId) then
    db.installationId = ACL.Uuid.v4()
  end
  ACL.db = db
  return db
end

--- Forward migration. Never drops unsynced reports/outbox entries.
function State.migrate(db)
  db._backup = { schemaVersion = db.schemaVersion }
  db.schemaVersion = State.SCHEMA_VERSION
  -- v1 is the initial schema; future migrations chain here.
end

--- Count reports that have never been acknowledged (never trimmed).
function State.unsyncedCount()
  if not ACL.db then return 0 end
  local n = 0
  for _, r in pairs(ACL.db.reports) do
    if r.status ~= "acked" and r.status ~= "superseded" then n = n + 1 end
  end
  return n
end

ACL.State = State
