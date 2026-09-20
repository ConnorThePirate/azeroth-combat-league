--[[
  Domain/Series.lua — best-of series scoring (docs/07).

  One series -> one ladder event. Tracks per-game outcomes, detects the series
  winner, and exposes a compact scoreboard for the UI.
]]
local _, ACL = ...

local Series = {}
Series.__index = Series

--- bestOf: 1, 3 or 5.
function Series.new(bestOf)
  return setmetatable({
    bestOf = bestOf,
    games = {},       -- index -> {winner=characterId|nil, reason, void=bool}
    wins = {},        -- characterId -> count
    finished = false,
    winner = nil,
    draw = false,
  }, Series)
end

function Series:winsNeeded()
  return math.ceil(self.bestOf / 2)
end

--- Record a decided game. voided games do not count toward the score.
function Series:recordGame(index, winnerCharacterId, reason, voided)
  if self.finished then return end
  self.games[index] = { winner = winnerCharacterId, reason = reason, void = voided or false }
  if not voided and winnerCharacterId then
    self.wins[winnerCharacterId] = (self.wins[winnerCharacterId] or 0) + 1
    if self.wins[winnerCharacterId] >= self:winsNeeded() then
      self.finished = true
      self.winner = winnerCharacterId
    end
  end
end

--- Mark the series done without a winner (agreed draw / timeout / voided).
function Series:finishDraw()
  self.finished = true
  self.draw = true
end

function Series:nextGameIndex()
  local n = 0
  for i in pairs(self.games) do n = math.max(n, i + 1) end
  return n
end

function Series:score()
  local out = {}
  for id, w in pairs(self.wins) do out[#out + 1] = { characterId = id, wins = w } end
  return out
end

ACL.Series = Series
