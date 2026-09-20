--[[
  Domain/Contract.lua — match contract + lifecycle state machine (docs/06, 07).

  Three independent axes:
    lifecycle: proposed -> accepted -> ready -> armed -> active -> finished
               (+ declined/cancelled/expired pre-start, interrupted in active)
    evidence:  awaiting -> peer_supported -> corroborated | disputed | invalid
    rating:    ineligible | pending | applied | held | superseded

  The contract document is canonicalized + hashed exactly like
  packages/contracts — hash binds content, never proves honesty.
]]
local _, ACL = ...

local Contract = {}

-- Time policy from docs/07 (ms)
Contract.TIMING = {
  acceptWindowMs = 15 * 60 * 1000,
  readyStartMs = 5 * 60 * 1000,
  activeGameTimeoutMs = 15 * 60 * 1000,
  disconnectRecoveryMs = 5 * 60 * 1000,
  firstReportWindowMs = 72 * 60 * 60 * 1000,
  peerEvidenceWindowMs = 72 * 60 * 60 * 1000,
}

local LIFECYCLE_FORWARD = {
  proposed = { accepted = true, declined = true, cancelled = true, expired = true },
  accepted = { ready = true, cancelled = true, expired = true },
  ready = { armed = true, cancelled = true, expired = true },
  armed = { active = true, cancelled = true, expired = true },
  active = { finished = true, interrupted = true },
  interrupted = { active = true, finished = true, cancelled = true }, -- resume / resolve / abandon
  finished = {},
  declined = {}, cancelled = {}, expired = {},
}

-- ---------------------------------------------------------------------------
-- Contract document
-- ---------------------------------------------------------------------------

--- Build a wf.match-contract.v2 document.
--- participants: {{characterId, side=1|2}, ...} exactly two, distinct.
function Contract.build(opts)
  local doc = {
    schema = "wf.match-contract.v2",
    sessionId = opts.sessionId,
    seasonId = opts.seasonId,
    poolId = opts.poolId,
    ladder = opts.ladder or ACL.Json.null,   -- null = custom/unrated
    ratedIntent = opts.ratedIntent and true or false,
    bestOf = opts.bestOf,
    rulesetVersionId = opts.rulesetVersionId,
    participants = ACL.Json.array(opts.participants),
    levelMin = opts.levelMin,
    levelMax = opts.levelMax,
    venue = opts.venue or { kind = "anywhere", mapId = ACL.Json.null, areaId = ACL.Json.null },
    tournamentMatchId = opts.tournamentMatchId or ACL.Json.null,
    createdAtMs = opts.createdAtMs,
    acceptByMs = opts.acceptByMs,
    configVersion = opts.configVersion or "beta-v2",
  }
  return doc
end

function Contract.hash(doc)
  return ACL.Codec.contentHash(doc)
end

-- ---------------------------------------------------------------------------
-- Session: lifecycle + evidence + rating axes
-- ---------------------------------------------------------------------------

local Session = {}
Session.__index = Session
Contract.Session = Session

function Contract.newSession(contractDoc, selfCharacterId)
  return setmetatable({
    contract = contractDoc,
    contractHash = Contract.hash(contractDoc),
    selfCharacterId = selfCharacterId,
    lifecycle = "proposed",
    evidence = "awaiting",
    rating = "ineligible",
    acceptedBy = {},          -- side -> true
    readyBy = {},             -- side -> true
    games = {},               -- recorded game results
    peerDigests = {},
    proposedAtMs = nil, acceptedAtMs = nil, startedAtMs = nil, finishedAtMs = nil,
    series = ACL.Series.new(contractDoc.bestOf),
  }, Session)
end

function Session:transition(to, nowMs)
  local allowed = LIFECYCLE_FORWARD[self.lifecycle]
  if not (allowed and allowed[to]) then
    return nil, "invalid_transition"
  end
  self.lifecycle = to
  if to == "accepted" then self.acceptedAtMs = nowMs end
  if to == "active" then self.startedAtMs = nowMs end
  if to == "finished" then self.finishedAtMs = nowMs end
  ACL.Events.emit("session.lifecycle", self, to)
  return true
end

function Session:accept(side, nowMs)
  self.acceptedBy[side] = true
  local both = self.acceptedBy[1] and self.acceptedBy[2]
  if both and self.lifecycle == "proposed" then
    return self:transition("accepted", nowMs)
  end
  return true
end

--- A counteroffer clears all acceptances (docs/07).
function Session:counter(newDoc)
  self.contract = newDoc
  self.contractHash = Contract.hash(newDoc)
  self.acceptedBy = {}
  self.readyBy = {}
  self.lifecycle = "proposed"
  ACL.Events.emit("session.counter", self)
end

function Session:markReady(side)
  self.readyBy[side] = true
  if self.readyBy[1] and self.readyBy[2] and self.lifecycle == "accepted" then
    return self:transition("ready", GetServerTime and GetServerTime() * 1000 or 0)
  end
  return true
end

--- Record a local game observation; returns series-complete flag.
function Session:recordGame(index, winnerCharacterId, reason, voided, nowMs)
  self.games[index] = {
    winner = winnerCharacterId, reason = reason, voided = voided or false,
  }
  self.series:recordGame(index, winnerCharacterId, reason, voided)
  if self.series.finished then
    self:transition("finished", nowMs)
    return true
  end
  return false
end

function Session:opponentCharacterId()
  for _, p in ipairs(self.contract.participants) do
    if p.characterId ~= self.selfCharacterId then return p.characterId end
  end
  return nil
end

function Session:selfSide()
  for _, p in ipairs(self.contract.participants) do
    if p.characterId == self.selfCharacterId then return p.side end
  end
  return nil
end

ACL.Contract = Contract
