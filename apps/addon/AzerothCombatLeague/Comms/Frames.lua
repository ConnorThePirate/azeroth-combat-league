--[[
  Comms/Frames.lua — peer transport framing (docs/06), byte-identical with
  packages/contracts/src/frames.ts.

    WF2|<sid>|<mid>|<seq>|<ci>/<cn>|<sum>|<data>
      sid  — 4-char base64url session short ID
      mid  — 8-char base64url message ID
      seq  — sender-side message sequence, base36
      ci/cn— chunk index (0-based)/total, base36
      sum  — 4-hex CRC32 of this chunk's decoded bytes
      data — base64url chunk payload
]]
local _, ACL = ...

local Base64Url = ACL.Base64Url
local Crc32 = ACL.Crc32

local TRANSPORT = {
  frameBytes = 200,
  maxMessageBytes = 16 * 1024,
  maxChunks = 256,
  maxConcurrentAssemblies = 4,
  assemblyIdleTimeoutSec = 30,
  assemblyTotalTimeoutSec = 180,
  tokenBucketPerSec = 4,
  tokenBucketBurst = 8,
  retryDelaysSec = { 2, 5, 10 },
}
ACL.TransportLimits = TRANSPORT

local Frames = {}

local BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"
local function toB36(n)
  if n == 0 then return "0" end
  local out = {}
  while n > 0 do
    local d = n % 36
    out[#out + 1] = BASE36:sub(d + 1, d + 1)
    n = math.floor(n / 36)
  end
  -- reverse
  local s = ""
  for i = #out, 1, -1 do s = s .. out[i] end
  return s
end
local function fromB36(s)
  local n = 0
  for i = 1, #s do
    local d = BASE36:find(s:sub(i, i), 1, true)
    if not d then return nil end
    n = n * 36 + (d - 1)
  end
  return n
end
Frames.toB36, Frames.fromB36 = toB36, fromB36

local B64_RE = "^[A-Za-z0-9_%-]+$"
local B36_RE = "^[0-9a-z]+$"

local function err(code, msg) return nil, { code = code, message = msg } end

function Frames.encode(f)
  local head = "WF2|" .. f.sessionShortId .. "|" .. f.messageId .. "|"
    .. toB36(f.seq) .. "|" .. toB36(f.chunkIndex) .. "/" .. toB36(f.chunkTotal)
    .. "|" .. f.checksum .. "|"
  local frame = head .. f.data
  if #frame > TRANSPORT.frameBytes then
    return nil, { code = "invalid_field", message = "frame exceeds " .. TRANSPORT.frameBytes .. " bytes" }
  end
  return frame
end

--- Returns frame table or nil, err.
function Frames.decode(text)
  if type(text) ~= "string" or #text > TRANSPORT.frameBytes then
    return err("invalid_field", "frame too large")
  end
  local parts = {}
  for piece in (text .. "|"):gmatch("(.-)|") do
    parts[#parts + 1] = piece
  end
  if #parts ~= 7 or parts[1] ~= "WF2" then
    return err("malformed_envelope", "bad frame layout")
  end
  local sid, mid, seqS, cix, sum, data = parts[2], parts[3], parts[4], parts[5], parts[6], parts[7]
  if not sid:match("^[A-Za-z0-9_%-][A-Za-z0-9_%-][A-Za-z0-9_%-][A-Za-z0-9_%-]$") then
    return err("invalid_field", "bad session short id")
  end
  if not mid:match("^[A-Za-z0-9_%-]+$") or #mid ~= 8 then
    return err("invalid_field", "bad message id")
  end
  if not seqS:match(B36_RE) then return err("invalid_field", "bad sequence") end
  if not sum:match("^[0-9a-f][0-9a-f][0-9a-f][0-9a-f]$") then
    return err("invalid_field", "bad checksum")
  end
  if #data > 0 and not data:match(B64_RE) then
    return err("invalid_field", "bad chunk data")
  end
  local slash = cix:find("/", 1, true)
  if not slash or slash <= 1 then return err("invalid_field", "bad chunk index") end
  local chunkIndex = fromB36(cix:sub(1, slash - 1))
  local chunkTotal = fromB36(cix:sub(slash + 1))
  if not chunkIndex or not chunkTotal or chunkTotal < 1
      or chunkIndex >= chunkTotal or chunkTotal > TRANSPORT.maxChunks then
    return err("invalid_field", "bad chunk index/total")
  end
  local raw, derr = Base64Url.decode(data)
  if not raw then return err("invalid_field", derr) end
  if Crc32.hex16(raw) ~= sum then
    return err("bad_crc", "chunk checksum mismatch")
  end
  local msgSeq = fromB36(seqS)
  return {
    sessionShortId = sid, messageId = mid, seq = msgSeq,
    chunkIndex = chunkIndex, chunkTotal = chunkTotal,
    checksum = sum, data = data,
  }
end

--- Split a message body (byte string) into frames within the byte budget.
--- Returns array of frame strings, or nil + err.
function Frames.chunk(opts)
  local sid, mid, seq, body = opts.sessionShortId, opts.messageId, opts.seq, opts.body
  if #body > TRANSPORT.maxMessageBytes then
    return err("invalid_field", "message exceeds " .. TRANSPORT.maxMessageBytes .. " bytes")
  end
  local probeTotal = math.min(TRANSPORT.maxChunks, math.max(1, math.ceil(#body / 96)))
  local head = "WF2|" .. sid .. "|" .. mid .. "|" .. toB36(seq) .. "|"
    .. toB36(probeTotal - 1) .. "/" .. toB36(probeTotal) .. "|ffff|"
  local dataChars = TRANSPORT.frameBytes - #head
  local dataBytes = math.floor(dataChars / 4) * 3 - 3
  local chunkTotal = math.max(1, math.ceil(#body / dataBytes))
  if chunkTotal > TRANSPORT.maxChunks then
    return err("invalid_field", "message requires " .. chunkTotal .. " chunks (max " .. TRANSPORT.maxChunks .. ")")
  end
  local frames = {}
  for ci = 0, chunkTotal - 1 do
    local chunk = body:sub(ci * dataBytes + 1, math.min(#body, (ci + 1) * dataBytes))
    local frame, ferr = Frames.encode({
      sessionShortId = sid, messageId = mid, seq = seq,
      chunkIndex = ci, chunkTotal = chunkTotal,
      checksum = Crc32.hex16(chunk), data = Base64Url.encode(chunk),
    })
    if not frame then return nil, ferr end
    frames[#frames + 1] = frame
  end
  return frames
end

-- Reassembler -----------------------------------------------------------------

local Reassembler = {}
Reassembler.__index = Reassembler

function Frames.newReassembler()
  return setmetatable({ assemblies = {} }, Reassembler)
end

--- Feed a decoded frame; returns assembled body string or nil.
function Reassembler:push(frame, senderKey, nowMs)
  local key = senderKey .. "|" .. frame.messageId
  local a = self.assemblies[key]
  if not a then
    local count = 0
    for k in pairs(self.assemblies) do
      if k:sub(1, #senderKey + 1) == senderKey .. "|" then count = count + 1 end
    end
    if count >= TRANSPORT.maxConcurrentAssemblies then
      return nil, { code = "invalid_field", message = "too many concurrent assemblies" }
    end
    a = {
      messageId = frame.messageId, seq = frame.seq, total = frame.chunkTotal,
      chunks = {}, received = 0, lastProgressMs = nowMs, startedMs = nowMs,
    }
    self.assemblies[key] = a
  end
  if a.total ~= frame.chunkTotal then
    return nil, { code = "invalid_field", message = "chunk total changed mid-assembly" }
  end
  if a.chunks[frame.chunkIndex] == nil then
    a.chunks[frame.chunkIndex] = Base64Url.decode(frame.data)
    a.received = a.received + 1
    a.lastProgressMs = nowMs
  end
  if a.received < a.total then return nil end
  local parts = {}
  for i = 0, a.total - 1 do parts[#parts + 1] = a.chunks[i] end
  self.assemblies[key] = nil
  return table.concat(parts)
end

--- Drop stale assemblies; returns dropped keys for diagnostics.
function Reassembler:sweep(nowMs)
  local dropped = {}
  for k, a in pairs(self.assemblies) do
    local idle = nowMs - a.lastProgressMs
    local age = nowMs - a.startedMs
    if idle > TRANSPORT.assemblyIdleTimeoutSec * 1000
        or age > TRANSPORT.assemblyTotalTimeoutSec * 1000 then
      self.assemblies[k] = nil
      dropped[#dropped + 1] = k
    end
  end
  return dropped
end

function Reassembler:size()
  local n = 0
  for _ in pairs(self.assemblies) do n = n + 1 end
  return n
end

-- Token bucket -----------------------------------------------------------------

local TokenBucket = {}
TokenBucket.__index = TokenBucket

function Frames.newTokenBucket(nowMs)
  return setmetatable({ tokens = TRANSPORT.tokenBucketBurst, lastMs = nowMs }, TokenBucket)
end

--- Consume one frame's worth; returns 0 if allowed else ms to wait.
function TokenBucket:tryTake(nowMs)
  local elapsed = (nowMs - self.lastMs) / 1000
  self.tokens = math.min(TRANSPORT.tokenBucketBurst,
    self.tokens + elapsed * TRANSPORT.tokenBucketPerSec)
  self.lastMs = nowMs
  if self.tokens >= 1 then
    self.tokens = self.tokens - 1
    return 0
  end
  return math.ceil((1 - self.tokens) / TRANSPORT.tokenBucketPerSec * 1000)
end

-- IDs -------------------------------------------------------------------------

--- sid: 3 random bytes -> 4 chars; mid: 6 bytes -> 8 chars.
function Frames.newSessionShortId()
  return Base64Url.encode(string.char(
    math.random(0, 255), math.random(0, 255), math.random(0, 255)))
end

function Frames.newMessageId()
  return Base64Url.encode(string.char(
    math.random(0, 255), math.random(0, 255), math.random(0, 255),
    math.random(0, 255), math.random(0, 255), math.random(0, 255)))
end

ACL.Frames = Frames
