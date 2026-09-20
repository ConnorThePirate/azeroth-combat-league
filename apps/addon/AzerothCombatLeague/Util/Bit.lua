--[[
  Util/Bit.lua — 32-bit unsigned bitwise operations.

  Prefers the client's native `bit`/`bit32` library (fast, C-backed). When
  neither exists, falls back to an arithmetic implementation so codec code
  stays correct on any Lua 5.1-style runtime. All results are normalized to
  unsigned [0, 2^32-1] because native bit libraries may return signed values.
]]
local _, ACL = ...

local MOD = 4294967296 -- 2^32

-- Lua 5.3+ runtimes distinguish integer/float subtypes; bitwise operators and
-- %x formatting require the integer subtype. math.tointeger does not exist on
-- 5.1 (real WoW) where every number is a double — a passthrough is correct.
local toint = math.tointeger or function(x) return x end

local function to32(x)
  x = x % MOD
  if x < 0 then x = x + MOD end
  return toint(x) or x
end

--- Coerce a number to integer subtype when the runtime has one.
local function I(x)
  return toint(x) or math.floor(x)
end

-- Pure-Lua fallback -----------------------------------------------------------

local function f_band(a, b)
  a, b = to32(a), to32(b)
  local r, p = 0, 1
  while a > 0 and b > 0 do
    local ab, bb = a % 2, b % 2
    if ab == 1 and bb == 1 then r = r + p end
    a, b = (a - ab) / 2, (b - bb) / 2
    p = p * 2
  end
  return r
end

local function f_bor(a, b)
  a, b = to32(a), to32(b)
  local r, p = 0, 1
  while a > 0 or b > 0 do
    local ab, bb = a % 2, b % 2
    if ab + bb >= 1 then r = r + p end
    a, b = (a - ab) / 2, (b - bb) / 2
    p = p * 2
  end
  return r
end

local function f_bxor(a, b)
  a, b = to32(a), to32(b)
  local r, p = 0, 1
  while a > 0 or b > 0 do
    local ab, bb = a % 2, b % 2
    if ab ~= bb then r = r + p end
    a, b = (a - ab) / 2, (b - bb) / 2
    p = p * 2
  end
  return r
end

local function f_bnot(a)
  return MOD - 1 - to32(a)
end

local function f_lshift(a, n)
  if n >= 32 then return 0 end
  return to32(a) * (2 ^ n) % MOD
end

local function f_rshift(a, n)
  if n >= 32 then return 0 end
  return math.floor(to32(a) / (2 ^ n))
end

-- Resolution ------------------------------------------------------------------

local native = rawget(_G, "bit") or rawget(_G, "bit32")
local Bit = {}

if native and type(native.band) == "function" then
  -- Wrap to force unsigned results regardless of the native flavor.
  Bit.band   = function(a, b) return to32(native.band(I(a), I(b))) end
  Bit.bor    = function(a, b) return to32(native.bor(I(a), I(b))) end
  Bit.bxor   = function(a, b) return to32(native.bxor(I(a), I(b))) end
  Bit.bnot   = function(a)    return to32(native.bnot(I(a))) end
  Bit.lshift = function(a, n) return to32(native.lshift(I(a), I(n))) end
  Bit.rshift = function(a, n) return to32(native.rshift(I(a), I(n))) end
  Bit.native = true
else
  Bit.band, Bit.bor, Bit.bxor = f_band, f_bor, f_bxor
  Bit.bnot, Bit.lshift, Bit.rshift = f_bnot, f_lshift, f_rshift
  Bit.native = false
end

-- Derived helpers used by SHA-256 --------------------------------------------

function Bit.rrotate(x, n)
  n = n % 32
  if n == 0 then return to32(x) end
  return Bit.bor(Bit.rshift(x, n), Bit.lshift(x, 32 - n))
end

function Bit.to32(x) return to32(x) end

ACL.Bit = Bit
