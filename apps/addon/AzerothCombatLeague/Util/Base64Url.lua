--[[
  Util/Base64Url.lua — RFC 4648 base64url, padding-free (the wire form used in
  WFP2/WFU1 envelopes and transport frames). Decoder accepts no padding and
  rejects lengths ≡ 1 (mod 4) like the TS implementation.
]]
local _, ACL = ...

local ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
local enc = {}
for i = 0, 63 do enc[i] = ALPHA:sub(i + 1, i + 1) end
local dec = {}
for i = 0, 63 do dec[enc[i]:byte()] = i end

local Base64Url = {}

function Base64Url.encode(data)
  local out = {}
  local n = #data
  local i = 1
  while i + 2 <= n do
    local a, b, c = data:byte(i, i + 2)
    local v = a * 65536 + b * 256 + c
    out[#out + 1] = enc[math.floor(v / 262144) % 64]
    out[#out + 1] = enc[math.floor(v / 4096) % 64]
    out[#out + 1] = enc[math.floor(v / 64) % 64]
    out[#out + 1] = enc[v % 64]
    i = i + 3
  end
  local rem = n - i + 1
  if rem == 1 then
    local a = data:byte(i)
    out[#out + 1] = enc[math.floor(a / 4) % 64]
    out[#out + 1] = enc[(a % 4) * 16]
  elseif rem == 2 then
    local a, b = data:byte(i, i + 1)
    local v = a * 256 + b
    out[#out + 1] = enc[math.floor(v / 1024) % 64]
    out[#out + 1] = enc[math.floor(v / 16) % 64]
    out[#out + 1] = enc[(v % 16) * 4]
  end
  return table.concat(out)
end

--- Returns decoded string or nil, err.
function Base64Url.decode(text)
  if text:find("[^A-Za-z0-9_%-]") then
    return nil, "invalid base64url character"
  end
  local n = #text
  if n % 4 == 1 then
    return nil, "invalid base64url length"
  end
  local out = {}
  local i = 1
  while i + 3 <= n do
    local a = dec[text:byte(i)]
    local b = dec[text:byte(i + 1)]
    local c = dec[text:byte(i + 2)]
    local d = dec[text:byte(i + 3)]
    local v = a * 262144 + b * 4096 + c * 64 + d
    out[#out + 1] = string.char(math.floor(v / 65536) % 256,
                                math.floor(v / 256) % 256, v % 256)
    i = i + 4
  end
  local rem = n - i + 1
  if rem == 2 then
    local a = dec[text:byte(i)]
    local b = dec[text:byte(i + 1)]
    out[#out + 1] = string.char((a * 4 + math.floor(b / 16)) % 256)
  elseif rem == 3 then
    -- 3 chars = 18 bits -> 2 bytes: b0 = v>>10, b1 = (v>>2)&0xFF
    local a = dec[text:byte(i)]
    local b = dec[text:byte(i + 1)]
    local c = dec[text:byte(i + 2)]
    local v = a * 4096 + b * 64 + c
    out[#out + 1] = string.char(math.floor(v / 1024) % 256, math.floor(v / 4) % 256)
  end
  return table.concat(out)
end

ACL.Base64Url = Base64Url
