--[[
  Bootstrap.lua — addon entry point (docs/05).

  Initializes SavedVariables, seeds RNG, wires adapters/comms, registers
  slash commands, and keeps every game-dependent feature behind a measured
  capability. ADDON_LOADED -> PLAYER_LOGIN ordering is respected.
]]
local addonName, ACL = ...

ACL.VERSION = "0.1.0"
ACL.PROTOCOL_MAJOR = 2

local booted = false

local function seedRandom()
  local t = GetServerTime and GetServerTime() or 0
  local guid = UnitGUID and UnitGUID("player") or ""
  local h = 0
  for i = 1, #guid do h = (h * 31 + guid:byte(i)) % 4294967296 end
  math.randomseed((t + h + math.floor(GetTime() * 1000)) % 2147483647)
  math.random(); math.random(); math.random() -- warm up
end

local function onLoaded(loadedName)
  if loadedName ~= addonName then return end
  ACL.State.init()
  seedRandom()
  -- companion-staged WFU1 payload (Data/Inbound.lua) — applied once by digest
  local res = ACL.Import.applyPending()
  if res and DEFAULT_CHAT_FRAME then
    DEFAULT_CHAT_FRAME:AddMessage(string.format(
      "|cff55aaffACL|r update applied — %d receipt%s, %d ruleset%s",
      res.receipts or 0, res.receipts == 1 and "" or "s",
      res.rulesets or 0, res.rulesets == 1 and "" or "s"))
  end
  ACL.Diagnostics.add("info", "boot", "state ready")
end

local function onLogin()
  if booted then return end
  booted = true
  ACL.Transport.init()
  ACL.Duel.init()
  ACL.CombatLog.init()
  ACL.UI.Shell.init()
  ACL.UI.SyncBadge.init()
  -- pump outbound frames + expire stale assemblies at a low rate
  if C_Timer and C_Timer.NewTicker then
    C_Timer.NewTicker(0.25, function()
      ACL.Reliability.pump()
      ACL.Reliability.sweep()
    end)
  end
  ACL.Diagnostics.add("info", "boot", "login complete")
end

ACL.Events.on("ADDON_LOADED", onLoaded)
ACL.Events.on("PLAYER_LOGIN", onLogin)

-- slash commands ------------------------------------------------------------

SLASH_ACL1 = "/acl"
SLASH_ACL2 = "/fight"
SlashCmdList = SlashCmdList or {}
SlashCmdList.ACL = function(msg)
  msg = (msg or ""):gsub("^%s+", ""):gsub("%s+$", ""):lower()
  if not ACL.db then return end -- too early
  if msg == "" then
    ACL.UI.Shell.toggle()
  elseif msg == "lab" then
    ACL.UI.Shell.show("Lab")
  elseif msg == "sync" then
    ACL.UI.Shell.show("Sync")
  elseif msg == "challenge" then
    ACL.UI.Shell.show("Challenge")
  elseif msg == "history" or msg == "matches" then
    ACL.UI.Shell.show("Matches")
  else
    DEFAULT_CHAT_FRAME:AddMessage("|cff55aaffACL|r — /acl, /acl lab, /acl sync, /acl challenge, /acl history")
  end
end

-- duel finish -> result card --------------------------------------------------

ACL.Events.subscribe("duel.finished", function(outcome)
  -- find the active session and record the observed game
  if not ACL.sessions then return end
  for _, s in pairs(ACL.sessions) do
    if s.lifecycle == "active" or s.lifecycle == "armed" then
      local winnerId = nil
      if outcome.winner then
        -- map winner name to a participant only if it matches a contract name
        for _, p in ipairs(s.contract.participants) do
          if s.peerName == outcome.winner then
            winnerId = p.characterId ~= s.selfCharacterId and p.characterId or nil
          end
        end
        if winnerId == nil and outcome.winner == (UnitName and UnitName("player")) then
          winnerId = s.selfCharacterId
        end
      end
      s:recordGame(s.series:nextGameIndex(), winnerId, outcome.reason, false, outcome.endMs)
      if s.series.finished then
        ACL.UI.Result.show(s)
      end
      break
    end
  end
end)
