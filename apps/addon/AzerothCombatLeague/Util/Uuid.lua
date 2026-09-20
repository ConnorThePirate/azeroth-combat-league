--[[
  Util/Uuid.lua — UUID v4 minting and validation.

  UUIDs are collision identifiers, never security tokens (docs/06). Randomness
  comes from math.random seeded in Bootstrap with time + character entropy;
  that is sufficient for collision avoidance and deliberately not a secret.
]]
local _, ACL = ...

local Uuid = {}

local VARIANT = { "8", "9", "a", "b" }

local function rand32()
  -- two 16-bit draws keep every format argument under 2^31
  return math.random(0, 0xFFFF), math.random(0, 0xFFFF)
end

function Uuid.v4()
  local hi, lo = rand32()
  local hi2, lo2 = rand32()
  return string.format("%04x%04x-%04x-4%03x-%s%03x-%04x%04x%04x",
    hi, lo,
    math.random(0, 0xFFFF),
    math.random(0, 0xFFF),
    VARIANT[math.random(1, 4)],
    math.random(0, 0xFFF),
    hi2, lo2, math.random(0, 0xFFFF))
end

local UUID_RE = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

function Uuid.isValid(s)
  return type(s) == "string" and s:match(UUID_RE) ~= nil
end

ACL.Uuid = Uuid
