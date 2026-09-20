--[[
  Comms/Transport.lua — addon-message channel wiring (docs/06).

  Prefix WFCPVP2 over WHISPER/PARTY. Never sends in combat lockdown — frames
  queue and flush after. Sender identity always comes from the game event,
  never from frame bodies. Channel availability is a measured capability, not
  assumed.
]]
local _, ACL = ...

local Transport = {}
Transport.PREFIX = "WFCPVP2"

local registered = false
local sendQueue = {} -- {channel, target, text}

function Transport.init()
  if registered then return end
  if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then
    local ok = C_ChatInfo.RegisterAddonMessagePrefix(Transport.PREFIX)
    ACL.Capabilities.report("addon_whisper",
      ok and "observed_source" or "unknown",
      ok and "prefix registered; delivery unverified" or "prefix registration failed")
    registered = ok and true or false
  end
  ACL.Events.on("CHAT_MSG_ADDON", function(prefix, text, channel, sender)
    if prefix ~= Transport.PREFIX then return end
    ACL.Reliability.onRawFrame(text, channel, sender)
  end)
  -- flush queued sends once out of lockdown
  ACL.Events.on("PLAYER_REGEN_ENABLED", function() Transport.flush() end)
end

local function rawSend(channel, target, text)
  if not (C_ChatInfo and C_ChatInfo.SendAddonMessage) then return false, "unavailable" end
  if InCombatLockdown and InCombatLockdown() then return false, "lockdown" end
  local ok = C_ChatInfo.SendAddonMessage(Transport.PREFIX, text, channel, target)
  return ok ~= false, ok
end

--- Send one frame; queues silently during combat lockdown.
function Transport.send(channel, target, text)
  if #text > ACL.TransportLimits.frameBytes then
    return false, "too_large"
  end
  local ok, why = rawSend(channel, target, text)
  if not ok and why == "lockdown" then
    sendQueue[#sendQueue + 1] = { channel = channel, target = target, text = text }
    return false, "queued_lockdown"
  end
  return ok, why
end

function Transport.flush()
  local q = sendQueue
  sendQueue = {}
  for _, item in ipairs(q) do
    local ok = rawSend(item.channel, item.target, item.text)
    if not ok then
      -- still locked down (or send failed): requeue remainder
      sendQueue[#sendQueue + 1] = item
    end
  end
end

function Transport.queueLength() return #sendQueue end

ACL.Transport = Transport
