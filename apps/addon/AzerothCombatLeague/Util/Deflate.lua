--[[
  Util/Deflate.lua — raw DEFLATE (RFC 1951) using stored (BTYPE=00) blocks only.

  Stored blocks are valid DEFLATE: every conforming inflater (zlib, fflate,
  browser DecompressionStream) accepts them, so WFP2 exports produced here are
  readable everywhere. Decoding is likewise limited to stored blocks — WFU1
  bundles bound for the addon are emitted stored-only by the website. A stream
  containing fixed/dynamic Huffman blocks is rejected with
  "unsupported_compression" rather than misdecoded.
]]
local _, ACL = ...

local Deflate = {}

--- Encode data as a raw-DEFLATE stream of stored blocks. Returns a string.
function Deflate.stored(data)
  local n = #data
  local parts = {}
  local i = 1
  while true do
    local offset = i - 1
    local remaining = n - offset
    local len = math.min(remaining, 65535)
    local final = offset + len >= n
    local nlen = 65535 - len -- ~len & 0xffff
    parts[#parts + 1] = string.char(
      final and 1 or 0,
      len % 256, math.floor(len / 256) % 256,
      nlen % 256, math.floor(nlen / 256) % 256)
    if len > 0 then
      parts[#parts + 1] = data:sub(i, i + len - 1)
    end
    i = i + len
    if final then break end
  end
  return table.concat(parts)
end

--- Inflate a stored-block-only raw-DEFLATE stream.
--- Returns string, or nil + error code.
function Deflate.inflateStored(data, maxBytes)
  maxBytes = maxBytes or (256 * 1024)
  local n = #data
  local out = {}
  local total = 0
  local o = 1
  while true do
    if o + 4 > n then return nil, "decompression_failed" end
    local header = data:byte(o)
    -- stored blocks are byte-aligned: header must be exactly 0x00 or 0x01
    if header ~= 0 and header ~= 1 then
      return nil, "unsupported_compression"
    end
    local bfinal = header
    local len = data:byte(o + 1) + data:byte(o + 2) * 256
    local nlen = data:byte(o + 3) + data:byte(o + 4) * 256
    if nlen ~= 65535 - len then
      return nil, "decompression_failed"
    end
    o = o + 5
    if o + len - 1 > n then return nil, "decompression_failed" end
    if len > 0 then
      out[#out + 1] = data:sub(o, o + len - 1)
      total = total + len
      if total > maxBytes then return nil, "decoded_too_large" end
    end
    o = o + len
    if bfinal == 1 then break end
  end
  return table.concat(out)
end

ACL.Deflate = Deflate
