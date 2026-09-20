--[[
  Comms/Codec.lua — WFP2 / WFU1 envelope codec (docs/06).

    WFP2:<base64url(raw-DEFLATE(canonical-json))>:<8-hex-CRC32>
    WFU1:<base64url(raw-DEFLATE(canonical-json))>:<8-hex-CRC32>

  Encode/decode use stored-block DEFLATE only — valid DEFLATE that any
  inflater accepts, and the only compression the addon can produce/consume
  without a vendored library. Decoding a Huffman-compressed stream fails with
  "unsupported_compression" so the UI can ask for an addon-compatible export.
]]
local _, ACL = ...

local Json = ACL.Json
local Deflate = ACL.Deflate
local Base64Url = ACL.Base64Url
local Crc32 = ACL.Crc32
local Sha256 = ACL.Sha256

local LIMITS = {
  decodedBytes = 256 * 1024,
  compressedBytes = 128 * 1024,
  maxDepth = 16,
  maxStringBytes = 4096,
}

ACL.Limits = LIMITS

local Codec = {}

local function encodePayload(payload, tag)
  local ok, canonicalOrErr = pcall(Json.encode, payload)
  if not ok then return nil, canonicalOrErr end
  if #canonicalOrErr > LIMITS.decodedBytes then
    return nil, { code = "decoded_too_large", message = "payload exceeds limit" }
  end
  local compressed = Deflate.stored(canonicalOrErr)
  if #compressed > LIMITS.compressedBytes then
    return nil, { code = "compressed_too_large", message = "compressed payload exceeds limit" }
  end
  return tag .. ":" .. Base64Url.encode(compressed) .. ":" .. Crc32.hex(compressed)
end

local function decodePayload(envelope, expectedTag)
  if type(envelope) ~= "string" then
    return nil, { code = "malformed_envelope", message = "envelope is not a string" }
  end
  envelope = envelope:gsub("^%s+", ""):gsub("%s+$", "")
  local p1 = envelope:find(":", 1, true)
  local p2 = p1 and envelope:find(":", p1 + 1, true)
  if not p2 or envelope:find(":", p2 + 1, true) then
    return nil, { code = "malformed_envelope", message = "expected TAG:payload:crc" }
  end
  local tag = envelope:sub(1, p1 - 1)
  local b64 = envelope:sub(p1 + 1, p2 - 1)
  local crc = envelope:sub(p2 + 1)
  if tag ~= expectedTag then
    return nil, { code = "bad_tag", message = "expected " .. expectedTag .. " envelope, got " .. tag }
  end
  if #b64 > math.ceil(LIMITS.compressedBytes / 3) * 4 + 4 then
    return nil, { code = "compressed_too_large", message = "compressed section too large" }
  end
  local compressed, derr = Base64Url.decode(b64)
  if not compressed then
    return nil, { code = "malformed_envelope", message = derr }
  end
  if #compressed > LIMITS.compressedBytes then
    return nil, { code = "compressed_too_large", message = "compressed payload exceeds limit" }
  end
  if not crc:match("^[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]$")
      or Crc32.hex(compressed) ~= crc then
    return nil, { code = "bad_crc", message = "CRC32 mismatch — corrupted or truncated export" }
  end
  local plain, ierr = Deflate.inflateStored(compressed, LIMITS.decodedBytes)
  if not plain then
    return nil, { code = ierr, message = "could not inflate payload (" .. ierr .. ")" }
  end
  return Json.decode(plain, {
    maxDepth = LIMITS.maxDepth,
    maxStringBytes = LIMITS.maxStringBytes,
  })
end

-- WFP2: player -> website ----------------------------------------------------

function Codec.encodeExport(payload)
  return encodePayload(payload, "WFP2")
end

function Codec.decodeExport(envelope)
  return decodePayload(envelope, "WFP2")
end

-- WFU1: website -> addon -----------------------------------------------------

function Codec.encodeUpdate(payload)
  return encodePayload(payload, "WFU1")
end

function Codec.decodeUpdate(envelope)
  return decodePayload(envelope, "WFU1")
end

--- SHA-256 hex of the canonical bytes of a value (contractHash, bodyDigest…).
function Codec.contentHash(value)
  return Sha256.hex(Json.encode(value))
end

ACL.Codec = Codec
