--[[
  Util/CanonicalJson.lua — "restricted JSON" per docs/06, byte-identical with
  packages/contracts/src/canonical.ts (pinned by test/fixtures/canonical.json).

  - object keys ASCII, emitted sorted by byte order
  - UTF-8 string values preserved exactly, no normalization
  - only \" and \\ short escapes; control chars < 0x20 as \u00xx lowercase
  - safe integers only; no floats; arrays ordered; no whitespace
  - strict parser rejects duplicate keys, floats, unsafe ints, lone
    surrogates, invalid UTF-8, excessive depth/length

  Lua representation: objects are plain tables; arrays are tables with
  contiguous 1..n integer keys or tagged via Json.array{}; JSON null is the
  Json.null sentinel (Lua nil cannot survive inside an array).
]]
local _, ACL = ...

local Json = {}

-- ---------------------------------------------------------------------------
-- Value markers
-- ---------------------------------------------------------------------------

local NULL = setmetatable({}, { __tostring = function() return "JSON null" end })
Json.null = NULL

local ARRAY_MT = { __jsonArray = true }
function Json.array(t)
  return setmetatable(t or {}, ARRAY_MT)
end
local function isTaggedArray(t)
  return getmetatable(t) == ARRAY_MT
end

-- ---------------------------------------------------------------------------
-- UTF-8 helpers
-- ---------------------------------------------------------------------------

--- Validate UTF-8 byte sequence; rejects overlongs and surrogate code points.
local function utf8Valid(s)
  local i, n = 1, #s
  while i <= n do
    local b = s:byte(i)
    if b < 0x80 then
      i = i + 1
    elseif b >= 0xC2 and b <= 0xDF then
      local b2 = s:byte(i + 1)
      if not b2 or b2 < 0x80 or b2 > 0xBF then return false end
      i = i + 2
    elseif b >= 0xE0 and b <= 0xEF then
      local b2, b3 = s:byte(i + 1), s:byte(i + 2)
      if not b2 or not b3 then return false end
      if b == 0xE0 and (b2 < 0xA0 or b2 > 0xBF) then return false end
      if b == 0xED and (b2 < 0x80 or b2 > 0x9F) then return false end -- surrogates
      if b ~= 0xE0 and b ~= 0xED and (b2 < 0x80 or b2 > 0xBF) then return false end
      if b3 < 0x80 or b3 > 0xBF then return false end
      i = i + 3
    elseif b >= 0xF0 and b <= 0xF4 then
      local b2, b3, b4 = s:byte(i + 1), s:byte(i + 2), s:byte(i + 3)
      if not b2 or not b3 or not b4 then return false end
      if b == 0xF0 and (b2 < 0x90 or b2 > 0xBF) then return false end
      if b == 0xF4 and (b2 < 0x80 or b2 > 0x8F) then return false end
      if b ~= 0xF0 and b ~= 0xF4 and (b2 < 0x80 or b2 > 0xBF) then return false end
      if b3 < 0x80 or b3 > 0xBF or b4 < 0x80 or b4 > 0xBF then return false end
      i = i + 4
    else
      return false
    end
  end
  return true
end
Json.utf8Valid = utf8Valid

local function utf8Encode(cp)
  if cp < 0x80 then
    return string.char(cp)
  elseif cp < 0x800 then
    return string.char(0xC0 + math.floor(cp / 64), 0x80 + cp % 64)
  elseif cp < 0x10000 then
    return string.char(0xE0 + math.floor(cp / 4096),
      0x80 + math.floor(cp / 64) % 64, 0x80 + cp % 64)
  else
    return string.char(0xF0 + math.floor(cp / 262144),
      0x80 + math.floor(cp / 4096) % 64,
      0x80 + math.floor(cp / 64) % 64, 0x80 + cp % 64)
  end
end

-- ---------------------------------------------------------------------------
-- Errors — tables so callers can match on .code without string parsing
-- ---------------------------------------------------------------------------

local function fail(code, msg)
  error({ code = code, message = msg }, 0)
end
Json.fail = fail

-- ---------------------------------------------------------------------------
-- Encoder
-- ---------------------------------------------------------------------------

local MAX_DEPTH = 16
local MAX_SAFE = 9007199254740991 -- 2^53 - 1

local escapeByte = {}
for c = 0, 31 do
  escapeByte[c] = string.format("\\u%04x", c)
end
escapeByte[0x22] = '\\"'
escapeByte[0x5C] = "\\\\"

local function escapeString(s, out)
  if not utf8Valid(s) then fail("invalid_json", "invalid UTF-8 in string") end
  out[#out + 1] = '"'
  for i = 1, #s do
    local b = s:byte(i)
    local e = escapeByte[b]
    if e then
      out[#out + 1] = e
    else
      out[#out + 1] = string.char(b)
    end
  end
  out[#out + 1] = '"'
end

local function isAsciiKey(k)
  for i = 1, #k do
    if k:byte(i) > 0x7F then return false end
  end
  return true
end

local function tableIsArray(t)
  if isTaggedArray(t) then return true end
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" or k % 1 ~= 0 or k < 1 then return false end
    n = n + 1
  end
  if n == 0 then return false end -- untagged empty table -> object
  return n == #t
end

local writeValue -- forward

local function writeTable(t, out, depth)
  if depth > MAX_DEPTH then fail("too_deep", "JSON depth exceeds " .. MAX_DEPTH) end
  if tableIsArray(t) then
    out[#out + 1] = "["
    for i = 1, #t do
      if i > 1 then out[#out + 1] = "," end
      writeValue(t[i], out, depth + 1)
    end
    out[#out + 1] = "]"
    return
  end
  local keys = {}
  for k in pairs(t) do
    if type(k) ~= "string" then
      fail("invalid_json", "non-string object key")
    end
    if not isAsciiKey(k) then
      fail("invalid_json", "non-ASCII object key: " .. k)
    end
    keys[#keys + 1] = k
  end
  table.sort(keys)
  out[#out + 1] = "{"
  for i = 1, #keys do
    if i > 1 then out[#out + 1] = "," end
    escapeString(keys[i], out)
    out[#out + 1] = ":"
    writeValue(t[keys[i]], out, depth + 1)
  end
  out[#out + 1] = "}"
end

writeValue = function(value, out, depth)
  local t = type(value)
  if value == NULL then
    out[#out + 1] = "null"
  elseif t == "boolean" then
    out[#out + 1] = value and "true" or "false"
  elseif t == "number" then
    if value ~= value or value % 1 ~= 0 or value < -MAX_SAFE or value > MAX_SAFE then
      fail("invalid_json", "non-integer or unsafe number in canonical value")
    end
    if value == 0 then value = 0 end -- normalize -0
    out[#out + 1] = string.format("%.0f", value)
  elseif t == "string" then
    escapeString(value, out)
  elseif t == "table" then
    writeTable(value, out, depth)
  else
    fail("invalid_json", "unsupported value type " .. t)
  end
end

--- Serialize to canonical JSON. Throws a {code,message} table on invalid input.
function Json.encode(value)
  local out = {}
  writeValue(value, out, 0)
  return table.concat(out)
end

-- ---------------------------------------------------------------------------
-- Strict parser (mirrors canonical.ts Parser)
-- ---------------------------------------------------------------------------

local Parser = {}
Parser.__index = Parser

local function newParser(text, opts)
  return setmetatable({
    text = text,
    pos = 1, -- Lua strings are 1-indexed
    len = #text,
    maxDepth = opts.maxDepth or MAX_DEPTH,
    maxStringBytes = opts.maxStringBytes or 4096,
    requireCanonical = opts.requireCanonical or false,
  }, Parser)
end

function Parser:peek()
  if self.pos > self.len then return -1 end
  return self.text:byte(self.pos)
end

local WS = { [0x20] = true, [0x09] = true, [0x0A] = true, [0x0D] = true }

function Parser:skipWs()
  local c = self:peek()
  if self.requireCanonical then
    if WS[c] then fail("non_canonical", "whitespace in canonical JSON") end
    return
  end
  while WS[c] do
    self.pos = self.pos + 1
    c = self:peek()
  end
end

function Parser:readValue(depth)
  if depth > self.maxDepth then
    fail("too_deep", "JSON depth exceeds " .. self.maxDepth)
  end
  local c = self:peek()
  if c == 0x7B then return self:readObject(depth) end
  if c == 0x5B then return self:readArray(depth) end
  if c == 0x22 then return self:readString() end
  if c == 0x74 then return self:readLiteral("true", true) end
  if c == 0x66 then return self:readLiteral("false", false) end
  if c == 0x6E then return self:readLiteral("null", NULL) end
  if c == 0x2D or (c >= 0x30 and c <= 0x39) then return self:readNumber() end
  fail("invalid_json", "unexpected character at " .. (self.pos - 1))
end

function Parser:readLiteral(word, value)
  if self.text:sub(self.pos, self.pos + #word - 1) == word then
    self.pos = self.pos + #word
    return value
  end
  fail("invalid_json", "bad literal at " .. (self.pos - 1))
end

function Parser:readNumber()
  local start = self.pos
  if self:peek() == 0x2D then self.pos = self.pos + 1 end
  if self:peek() == 0x30 then
    self.pos = self.pos + 1
  else
    local s = self.pos
    while true do
      local c = self:peek()
      if c >= 0x30 and c <= 0x39 then self.pos = self.pos + 1 else break end
    end
    if self.pos == s then fail("invalid_json", "bad number at " .. (start - 1)) end
  end
  local c = self:peek()
  if c == 0x2E or c == 0x65 or c == 0x45 then
    fail("invalid_json", "non-integer number not allowed")
  end
  local n = tonumber(self.text:sub(start, self.pos - 1))
  if not n or n % 1 ~= 0 or n < -MAX_SAFE or n > MAX_SAFE then
    fail("invalid_json", "unsafe integer at " .. (start - 1))
  end
  return n
end

local ESCAPES = {
  [0x22] = '"', [0x5C] = "\\", [0x2F] = "/", [0x62] = "\b",
  [0x66] = "\f", [0x6E] = "\n", [0x72] = "\r", [0x74] = "\t",
}

function Parser:readHex4()
  local hex = self.text:sub(self.pos + 1, self.pos + 4)
  if #hex < 4 or hex:find("[^0-9a-fA-F]") then
    fail("invalid_json", "bad \\u escape")
  end
  self.pos = self.pos + 4
  return tonumber(hex, 16)
end

function Parser:readString()
  self.pos = self.pos + 1 -- opening quote
  local out = {}
  local byteLen = 0
  while true do
    if self.pos > self.len then fail("invalid_json", "unterminated string") end
    local c = self.text:byte(self.pos)
    if c == 0x22 then
      self.pos = self.pos + 1
      break
    elseif c == 0x5C then
      self.pos = self.pos + 1
      if self.pos > self.len then fail("invalid_json", "unterminated escape") end
      local e = self.text:byte(self.pos)
      local simple = ESCAPES[e]
      if simple then
        out[#out + 1] = simple
        byteLen = byteLen + 1
      elseif e == 0x75 then
        local cp = self:readHex4()
        if cp >= 0xD800 and cp <= 0xDBFF then
          -- high surrogate must pair with \uDC00-\uDFFF
          if self.text:sub(self.pos + 1, self.pos + 2) ~= "\\u" then
            fail("invalid_json", "lone surrogate in string")
          end
          self.pos = self.pos + 2
          local lo = self:readHex4()
          if lo < 0xDC00 or lo > 0xDFFF then
            fail("invalid_json", "lone surrogate in string")
          end
          cp = 0x10000 + (cp - 0xD800) * 1024 + (lo - 0xDC00)
        elseif cp >= 0xDC00 and cp <= 0xDFFF then
          fail("invalid_json", "lone surrogate in string")
        end
        local ch = utf8Encode(cp)
        out[#out + 1] = ch
        byteLen = byteLen + #ch
      else
        fail("invalid_json", "bad escape at " .. (self.pos - 1))
      end
      self.pos = self.pos + 1
    else
      if c < 0x20 then
        fail("invalid_json", "unescaped control character in string")
      end
      -- pass through raw bytes; whole-text UTF-8 check happens in parse()
      local b1 = c
      local seqLen
      if b1 < 0x80 then seqLen = 1
      elseif b1 < 0xE0 then seqLen = 2
      elseif b1 < 0xF0 then seqLen = 3
      else seqLen = 4 end
      out[#out + 1] = self.text:sub(self.pos, self.pos + seqLen - 1)
      byteLen = byteLen + seqLen
      self.pos = self.pos + seqLen
    end
    if byteLen > self.maxStringBytes then
      fail("string_too_long", "string exceeds " .. self.maxStringBytes .. " bytes")
    end
  end
  return table.concat(out)
end

function Parser:readObject(depth)
  self.pos = self.pos + 1 -- {
  local obj = {}
  local prevKey = nil
  self:skipWs()
  if self:peek() == 0x7D then
    self.pos = self.pos + 1
    return obj
  end
  while true do
    self:skipWs()
    if self:peek() ~= 0x22 then
      fail("invalid_json", "expected object key at " .. (self.pos - 1))
    end
    local key = self:readString()
    if not isAsciiKey(key) then
      fail("invalid_json", "non-ASCII object key " .. key)
    end
    if obj[key] ~= nil or rawget(obj, key) ~= nil then
      -- Lua cannot hold duplicate keys; detect before overwrite.
      fail("duplicate_key", "duplicate key " .. key)
    end
    if self.requireCanonical and prevKey ~= nil and key <= prevKey then
      fail("non_canonical", "object keys out of order: " .. key)
    end
    prevKey = key
    self:skipWs()
    if self:peek() ~= 0x3A then
      fail("invalid_json", "expected ':' at " .. (self.pos - 1))
    end
    self.pos = self.pos + 1
    self:skipWs()
    obj[key] = self:readValue(depth + 1)
    self:skipWs()
    local c = self:peek()
    if c == 0x2C then
      self.pos = self.pos + 1
    elseif c == 0x7D then
      self.pos = self.pos + 1
      return obj
    else
      fail("invalid_json", "expected ',' or '}' at " .. (self.pos - 1))
    end
  end
end

function Parser:readArray(depth)
  self.pos = self.pos + 1 -- [
  local arr = Json.array({})
  self:skipWs()
  if self:peek() == 0x5D then
    self.pos = self.pos + 1
    return arr
  end
  while true do
    self:skipWs()
    arr[#arr + 1] = self:readValue(depth + 1)
    self:skipWs()
    local c = self:peek()
    if c == 0x2C then
      self.pos = self.pos + 1
    elseif c == 0x5D then
      self.pos = self.pos + 1
      return arr
    else
      fail("invalid_json", "expected ',' or ']' at " .. (self.pos - 1))
    end
  end
end

function Parser:parse()
  if not utf8Valid(self.text) then
    fail("invalid_json", "payload is not valid UTF-8")
  end
  self:skipWs()
  local v = self:readValue(0)
  self:skipWs()
  if self.pos <= self.len then
    fail("invalid_json", "trailing content after JSON value")
  end
  return v
end

--- Strict parse. Returns value, or nil + error table.
function Json.decode(text, opts)
  if type(text) ~= "string" then
    return nil, { code = "invalid_json", message = "input is not a string" }
  end
  local ok, v = pcall(function()
    return newParser(text, opts or {}):parse()
  end)
  if ok then return v end
  if type(v) == "table" and v.code then return nil, v end
  return nil, { code = "invalid_json", message = tostring(v) }
end

--- Parse and require canonical form byte-for-byte.
function Json.decodeCanonical(text, opts)
  opts = opts or {}
  opts.requireCanonical = true
  return Json.decode(text, opts)
end

ACL.Json = Json
