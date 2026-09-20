--[[
  Util/Sha256.lua — SHA-256 in pure Lua over byte strings.

  Contract/report hashes bind content; they authenticate nothing by themselves
  (docs/06). Verified byte-for-byte against packages/contracts golden fixtures
  by tools/run-tests.mjs.
]]
local _, ACL = ...

local MOD = 4294967296

local K = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

local H0 = {
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
}

local Sha256 = {}

--- SHA-256 digest of a byte string, returned as lowercase hex.
function Sha256.hex(data)
  local bit = ACL.Bit
  local band, bxor, bnot = bit.band, bit.bxor, bit.bnot
  local rshift, rrot = bit.rshift, bit.rrotate

  -- Pre-processing: append 0x80, pad to 56 mod 64, append 64-bit bit length.
  local len = #data
  local bitLenHi = math.floor(len * 8 / MOD)
  local bitLenLo = (len * 8) % MOD
  local padLen = (56 - (len + 1) % 64) % 64
  local msg = data .. "\128" .. string.rep("\0", padLen)
    .. string.char(
      math.floor(bitLenHi / 16777216) % 256, math.floor(bitLenHi / 65536) % 256,
      math.floor(bitLenHi / 256) % 256, bitLenHi % 256,
      math.floor(bitLenLo / 16777216) % 256, math.floor(bitLenLo / 65536) % 256,
      math.floor(bitLenLo / 256) % 256, bitLenLo % 256)

  local h0, h1, h2, h3 = H0[1], H0[2], H0[3], H0[4]
  local h4, h5, h6, h7 = H0[5], H0[6], H0[7], H0[8]
  local w = {}

  for block = 1, #msg, 64 do
    for t = 0, 15 do
      local i = block + t * 4
      local b1, b2, b3, b4 = msg:byte(i, i + 3)
      w[t] = b1 * 16777216 + b2 * 65536 + b3 * 256 + b4
    end
    for t = 16, 63 do
      local x = w[t - 15]
      local s0 = bxor(bxor(rrot(x, 7), rrot(x, 18)), rshift(x, 3))
      local y = w[t - 2]
      local s1 = bxor(bxor(rrot(y, 17), rrot(y, 19)), rshift(y, 10))
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) % MOD
    end

    local a, b, c, d, e, f, g, h = h0, h1, h2, h3, h4, h5, h6, h7
    for t = 0, 63 do
      local s1 = bxor(bxor(rrot(e, 6), rrot(e, 11)), rrot(e, 25))
      local ch = bxor(band(e, f), band(bnot(e), g))
      local t1 = (h + s1 + ch + K[t + 1] + w[t]) % MOD
      local s0 = bxor(bxor(rrot(a, 2), rrot(a, 13)), rrot(a, 22))
      local maj = bxor(bxor(band(a, b), band(a, c)), band(b, c))
      local t2 = (s0 + maj) % MOD
      h, g, f, e, d, c, b, a = g, f, e, (d + t1) % MOD, c, b, a, (t1 + t2) % MOD
    end

    h0 = (h0 + a) % MOD; h1 = (h1 + b) % MOD; h2 = (h2 + c) % MOD; h3 = (h3 + d) % MOD
    h4 = (h4 + e) % MOD; h5 = (h5 + f) % MOD; h6 = (h6 + g) % MOD; h7 = (h7 + h) % MOD
  end

  -- %x requires the integer subtype on runtimes that distinguish int/float,
  -- and fengari's integers are int32 — format each 32-bit word as two 16-bit
  -- halves so no argument ever exceeds 2^31.
  local function hx(v)
    return string.format("%04x%04x", math.floor(v / 65536) % 65536, v % 65536)
  end
  return hx(h0) .. hx(h1) .. hx(h2) .. hx(h3) .. hx(h4) .. hx(h5) .. hx(h6) .. hx(h7)
end

ACL.Sha256 = Sha256
