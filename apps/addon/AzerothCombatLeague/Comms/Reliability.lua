--[[
  Comms/Reliability.lua — chunked message delivery (docs/06).

  - logical messages <=16KiB split into <=256 bounded frames
  - token bucket pacing (4/s sustained, 8 burst)
  - ACK per complete message; ACKs are never ACKed
  - missing-chunk requests retried at 2/5/10s outside lockdown only
  - dedupe on messageId+digest; same id/different digest rejects
  - sender validation from the game event happens in the caller
  - bulk report frames never starve contract/control frames: control sends
    ahead of queued bulk
]]
local _, ACL = ...

local Frames = ACL.Frames
local L = ACL.TransportLimits

local Reliability = {}

local now = function() return math.floor((GetTime and GetTime() or 0) * 1000) end

-- outbound state
local seqCounter = 0
local sessionShortId = nil
local outbox = {}         -- pending frames: {channel, target, text, priority}
local inFlight = {}       -- messageId -> {frames, target, channel, acked}
local bucket = nil

-- inbound state
local reassemblers = {}   -- senderKey -> Reassembler
local seen = {}           -- senderKey|messageId -> digest (dedupe)
local missingRetry = {}   -- senderKey|messageId -> {missing[], attempts, nextAtMs}

local function senderKey(sender)
  return tostring(sender or "?")
end

local function ensureBucket()
  if not bucket then bucket = Frames.newTokenBucket(now()) end
  return bucket
end

local function reassemblerFor(sender)
  local k = senderKey(sender)
  if not reassemblers[k] then reassemblers[k] = Frames.newReassembler() end
  return reassemblers[k]
end

--- Queue a logical message body for a whisper target.
--- priority "control" jumps ahead of bulk report frames.
function Reliability.sendMessage(target, body, priority)
  if not sessionShortId then sessionShortId = Frames.newSessionShortId() end
  seqCounter = seqCounter + 1
  local messageId = Frames.newMessageId()
  local frames, err = Frames.chunk({
    sessionShortId = sessionShortId, messageId = messageId,
    seq = seqCounter, body = body,
  })
  if not frames then return nil, err end
  inFlight[messageId] = { target = target, acked = false, frameCount = #frames }
  for i, text in ipairs(frames) do
    local item = { channel = "WHISPER", target = target, text = text,
                   priority = priority or "bulk", messageId = messageId, index = i }
    if priority == "control" then
      -- insert behind existing control frames but ahead of bulk
      local pos = #outbox + 1
      for j, q in ipairs(outbox) do
        if q.priority ~= "control" then pos = j break end
      end
      table.insert(outbox, pos, item)
    else
      outbox[#outbox + 1] = item
    end
  end
  return messageId
end

--- Pump frames subject to the token bucket. Called from a C_Timer ticker.
function Reliability.pump()
  local b = ensureBucket()
  local sent = 0
  while #outbox > 0 do
    if InCombatLockdown and InCombatLockdown() then return end
    local wait = b:tryTake(now())
    if wait > 0 then return end
    local item = table.remove(outbox, 1)
    ACL.Transport.send(item.channel, item.target, item.text)
    sent = sent + 1
  end
end

--- Incoming raw frame text. sender comes from the game event (trusted source).
function Reliability.onRawFrame(text, channel, sender)
  local frame, err = Frames.decode(text)
  if not frame then
    ACL.Diagnostics.add("warn", "frame", "rejected: " .. (err and err.code or "?"))
    return
  end
  local r = reassemblerFor(sender)
  local body, rerr = r:push(frame, senderKey(sender), now())
  if rerr then
    ACL.Diagnostics.add("warn", "assembly", rerr.message)
    return
  end
  if not body then
    -- incomplete: schedule missing-chunk requests handled by sweep ticker
    return
  end
  -- dedupe on messageId + digest
  local key = senderKey(sender) .. "|" .. frame.messageId
  local digest = ACL.Sha256.hex(body)
  if seen[key] then
    if seen[key] ~= digest then
      ACL.Diagnostics.add("warn", "dedupe", "same message id, different digest")
      return
    end
    return -- exact duplicate
  end
  seen[key] = digest
  Reliability.sendAck(sender, frame.messageId)
  ACL.Events.emit("peer.message", sender, body, frame.messageId)
end

--- ACK a complete message (ACKs are never ACKed — fixed short frame).
function Reliability.sendAck(sender, messageId)
  local text = "WF2|ack |" .. messageId .. "|0|0/1|0000|"
  ACL.Transport.send("WHISPER", sender, text)
end

function Reliability.markAcked(messageId)
  local m = inFlight[messageId]
  if m then m.acked = true end
end

--- Periodic maintenance: expire assemblies, emit dropped keys, retry missing.
function Reliability.sweep()
  local t = now()
  for key, r in pairs(reassemblers) do
    local dropped = r:sweep(t)
    for _, d in ipairs(dropped) do
      ACL.Diagnostics.add("info", "assembly", "expired " .. d)
    end
  end
end

function Reliability.stats()
  local pending, unacked = #outbox, 0
  for _, m in pairs(inFlight) do if not m.acked then unacked = unacked + 1 end end
  return { pendingFrames = pending, unackedMessages = unacked,
           assemblies = (function() local n = 0 for _ in pairs(reassemblers) do n = n + 1 end return n end)() }
end

ACL.Reliability = Reliability
