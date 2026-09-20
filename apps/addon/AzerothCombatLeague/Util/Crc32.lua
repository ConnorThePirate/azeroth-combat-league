--[[
  Util/Crc32.lua — CRC32 (IEEE 802.3, reflected, poly 0xEDB88320).
  Integrity checksum only; authenticates nothing (docs/06).
]]
local _, ACL = ...

local bit = ACL.Bit
local band, bxor, rshift = bit.band, bit.bxor, bit.rshift

local table_ = nil
local function buildTable()
  local t = {}
  for i = 0, 255 do
    local c = i
    for _ = 1, 8 do
      if c % 2 == 1 then
        c = bxor(rshift(c, 1), 0xEDB88320)
      else
        c = rshift(c, 1)
      end
    end
    t[i] = c
  end
  return t
end

local Crc32 = {}

function Crc32.sum(data)
  if not table_ then table_ = buildTable() end
  local crc = 0xFFFFFFFF
  for i = 1, #data do
    crc = bxor(rshift(crc, 8), table_[band(bxor(crc, data:byte(i)), 0xFF)])
  end
  return bxor(crc, 0xFFFFFFFF)
end

--- Format a 32-bit value as 8 lowercase hex digits. Two %04x halves keep every
--- argument under 2^31 for runtimes whose %x is limited to signed integers.
local function hex32(v)
  return string.format("%04x%04x", math.floor(v / 65536) % 65536, v % 65536)
end

function Crc32.hex(data)
  return hex32(Crc32.sum(data))
end

--- Low 16 bits as 4-hex — used for per-chunk frame checksums.
function Crc32.hex16(data)
  return string.format("%04x", band(Crc32.sum(data), 0xFFFF))
end

ACL.Crc32 = Crc32
