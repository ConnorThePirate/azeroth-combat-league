--[[
  Adapters/Duel.lua — duel event observation (docs/04, 05).

  Source snapshot: DUEL_FINISHED carries no winner payload; winner evidence
  comes from the localized "X has defeated Y in a duel" system message plus
  observable facts (death, bounds, surrender). We record what we actually saw
  and mark the winner unknown when evidence is ambiguous — never infer a win
  from low health.
]]
local _, ACL = ...

local Duel = {}

local function nowMs() return math.floor(GetTime() * 1000) end

-- localized "winner" system message patterns (GlobalStrings)
local WINNER_PATTERNS = {
  "DUEL_WINNER_KNOCKOUT",      -- "%1$s has defeated %2$s in a duel"
  "DUEL_WINNER_RETREAT",       -- "%1$s has fled from %2$s in a duel"
}

local winnerPatterns = {}
local function buildPatterns()
  if #winnerPatterns > 0 then return end
  for _, g in ipairs(WINNER_PATTERNS) do
    local fmt = rawget(_G, g)
    if type(fmt) == "string" then
      -- convert "%1$s"/"%s" printf to a Lua capture pattern
      local pat = fmt:gsub("([%^%$%(%)%%%.%[%]%*%+%-%?])", "%%%1")
      pat = pat:gsub("%%%%1%$s", "(.-)"):gsub("%%%%2%$s", "(.-)")
      pat = pat:gsub("%%%%s", "(.-)")
      pat = "^" .. pat .. "$"
      winnerPatterns[#winnerPatterns + 1] = pat
    end
  end
end

local state = {
  requestedBy = nil,     -- name from DUEL_REQUESTED
  active = false,
  outOfBounds = false,
  lastWinner = nil,      -- name
  lastLoser = nil,
  finishReason = "unknown",
  startMs = nil,
}

function Duel.init()
  buildPatterns()
  ACL.Events.on("DUEL_REQUESTED", function(name)
    state.requestedBy = name
    ACL.Capabilities.report("duel_events", "tested_pass", "DUEL_REQUESTED observed")
    ACL.Events.emit("duel.requested", name)
  end)
  ACL.Events.on("DUEL_INBOUNDS", function()
    state.outOfBounds = false
    state.active = true
    if not state.startMs then state.startMs = nowMs() end
    ACL.Events.emit("duel.bounds", false)
  end)
  ACL.Events.on("DUEL_OUTOFBOUNDS", function()
    state.outOfBounds = true
    state.active = true
    if not state.startMs then state.startMs = nowMs() end
    ACL.Events.emit("duel.bounds", true)
  end)
  ACL.Events.on("DUEL_FINISHED", function()
    state.active = false
    ACL.Capabilities.report("duel_events", "tested_pass", "DUEL_FINISHED observed")
    ACL.Events.emit("duel.finished", Duel.outcome())
    state.startMs = nil
    state.requestedBy = nil
  end)
  ACL.Events.on("CHAT_MSG_SYSTEM", function(text)
    Duel.onSystemMessage(text)
  end)
end

--- Parse duel outcome system messages; winner evidence only, no assumptions.
function Duel.onSystemMessage(text)
  buildPatterns()
  for _, pat in ipairs(winnerPatterns) do
    local a, b = text:match(pat)
    if a and b then
      state.lastWinner, state.lastLoser = a, b
      state.finishReason = "death"
      ACL.Capabilities.report("duel_winner_message", "tested_pass",
        "winner message parsed")
      ACL.Events.emit("duel.outcome", a, b)
      return
    end
  end
end

--- Current best-known outcome. winner is a NAME or nil — callers resolve to
--- characterId only when the name maps to a contract participant.
function Duel.outcome()
  return {
    winner = state.lastWinner,
    loser = state.lastLoser,
    reason = state.finishReason,
    outOfBounds = state.outOfBounds,
    startMs = state.startMs,
    endMs = nowMs(),
  }
end

function Duel.isActive() return state.active end

function Duel.reset()
  state.requestedBy, state.active, state.outOfBounds = nil, false, false
  state.lastWinner, state.lastLoser, state.finishReason = nil, nil, "unknown"
  state.startMs = nil
end

ACL.Duel = Duel
