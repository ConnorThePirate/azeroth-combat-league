-- Codec primitives: byte-exact parity with packages/contracts golden fixtures.
local ACL = __ACL_NS
local Json, Sha256, Crc32, B64 = ACL.Json, ACL.Sha256, ACL.Crc32, ACL.Base64Url
local Deflate, Codec, Frames = ACL.Deflate, ACL.Codec, ACL.Frames

-- primitives -----------------------------------------------------------------

T.test("sha256 golden vectors", function()
  for _, f in ipairs(FIXTURES.primitives) do
    if f.sha256 then
      T.eq(Sha256.hex(hexToBytes(f.inputHex)), f.sha256, f.name)
    end
    if f.crc32 then
      T.eq(Crc32.hex(hexToBytes(f.inputHex)), f.crc32, f.name)
    end
    if f.base64url then
      T.eq(B64.encode(hexToBytes(f.inputHex)), f.base64url, f.name)
      T.eq(bytesToHex(B64.decode(f.base64url)), f.inputHex, f.name .. " decode")
    end
  end
end)

-- canonical JSON ---------------------------------------------------------------

T.test("canonical fixtures: decode -> encode -> sha256", function()
  for _, f in ipairs(FIXTURES.canonical) do
    local v, err = Json.decodeCanonical(f.canonical)
    T.ok(v, f.name .. " decode: " .. tostring(err and err.message))
    local re = Json.encode(v)
    T.eq(re, f.canonical, f.name .. " re-encode")
    T.eq(bytesToHex(re), f.canonicalHex, f.name .. " bytes")
    T.eq(Sha256.hex(re), f.sha256, f.name .. " sha256")
  end
end)

T.test("canonical encode of hand-built tables", function()
  T.eq(Json.encode({}), "{}")
  T.eq(Json.encode({ Z = true, a = "x", b = 1, n = Json.null }),
    '{"Z":true,"a":"x","b":1,"n":null}')
  T.eq(Json.encode(Json.array({ 1, -5, "two", false, Json.null })),
    "[1,-5,\"two\",false,null]")
  T.eq(Json.encode({ s = "Äëñå 🌍 é" }), '{"s":"Äëñå 🌍 é"}')
  T.eq(Json.encode({ t = 1789833600000 }), '{"t":1789833600000}')
  T.eq(Json.encode({ s = "a\nb\tc\"d\\e" }), '{"s":"a\\u000ab\\u0009c\\"d\\\\e"}')
end)

T.test("encoder rejects invalid values", function()
  T.throws(function() Json.encode({ f = 1.5 }) end, "invalid_json")
  T.throws(function() Json.encode({ f = 9007199254740993 }) end, "invalid_json")
  T.throws(function() Json.encode({ ["ké"] = 1 }) end, "invalid_json")
  T.throws(function() Json.encode({ f = function() end }) end, "invalid_json")
  -- depth 17
  local deep = {}
  local cur = deep
  for _ = 1, 17 do cur.n = {}; cur = cur.n end
  T.throws(function() Json.encode(deep) end, "too_deep")
end)

T.test("parser strictness", function()
  local _, e1 = Json.decode('{"a":1,"a":2}')
  T.eq(T.errCode(e1), "duplicate_key")
  local _, e2 = Json.decode('{"b":1,"a":2}', { requireCanonical = true })
  T.eq(T.errCode(e2), "non_canonical")
  local _, e3 = Json.decode('{ "a":1}', { requireCanonical = true })
  T.eq(T.errCode(e3), "non_canonical")
  local _, e4 = Json.decode('{ "a":1}') -- whitespace ok when not canonical
  T.eq(e4, nil)
  local _, e5 = Json.decode('1.5')
  T.eq(T.errCode(e5), "invalid_json")
  local _, e6 = Json.decode('9007199254740993')
  T.eq(T.errCode(e6), "invalid_json")
  local _, e7 = Json.decode('"\\ud800"')
  T.eq(T.errCode(e7), "invalid_json")
  local v8 = Json.decode('"\\ud83c\\udf3c"')
  T.eq(v8, "🌼") -- paired surrogates -> single code point
  local _, e9 = Json.decode('[' .. string.rep('[', 17) .. string.rep(']', 17) .. ']')
  T.eq(T.errCode(e9), "too_deep")
  local _, e10 = Json.decode('"' .. string.rep("x", 4097) .. '"')
  T.eq(T.errCode(e10), "string_too_long")
  local _, e11 = Json.decode('{"a":1} trailing')
  T.eq(T.errCode(e11), "invalid_json")
end)

T.test("round-trip: encode -> decode", function()
  local src = {
    schema = "wf.test", arr = Json.array({ 1, "x", Json.null }),
    obj = { deep = { flag = true } }, n = -42, s = "héllo",
  }
  local text = Json.encode(src)
  local back = Json.decodeCanonical(text)
  T.eq(back.schema, "wf.test")
  T.eq(back.arr[2], "x")
  T.eq(back.obj.deep.flag, true)
  T.eq(back.n, -42)
  T.eq(back.s, "héllo")
end)

-- deflate ---------------------------------------------------------------------

T.test("stored deflate fixtures", function()
  for _, f in ipairs(FIXTURES.deflate) do
    local stored = hexToBytes(f.storedHex)
    if f.plainHex then
      local plain = hexToBytes(f.plainHex)
      T.eq(bytesToHex(Deflate.stored(plain)), f.storedHex, f.name .. " encode")
      local out = Deflate.inflateStored(stored, 256 * 1024)
      T.eq(out, plain, f.name .. " decode")
    else
      local out = Deflate.inflateStored(stored, 256 * 1024)
      T.eq(#out, f.plainLength, f.name .. " decode length")
    end
  end
end)

T.test("stored inflate rejects junk and huffman blocks", function()
  -- BTYPE=10 (dynamic) needs a full 5-byte header to reach the type check
  local _, e1 = Deflate.inflateStored("\x05\x00\x00\x00\x00", 1024)
  T.eq(e1, "unsupported_compression")
  local _, e2 = Deflate.inflateStored("\x01\x05", 1024) -- truncated
  T.eq(e2, "decompression_failed")
end)

-- envelopes -------------------------------------------------------------------

T.test("WFP2 stored fixture decodes and re-encodes byte-exact", function()
  local v, err = Codec.decodeExport(FIXTURES.envelopes.wfp2_stored)
  T.ok(v, "decode: " .. tostring(err and err.message))
  T.eq(v.schema, "wf.sync-envelope.v2")
  T.eq(#v.reports, 1)
  T.eq(v.reports[1].nonce, "nonce-1")
  local re, eerr = Codec.encodeExport(v)
  T.ok(re, "encode: " .. tostring(eerr and eerr.message))
  T.eq(re, FIXTURES.envelopes.wfp2_stored)
end)

T.test("WFU1 stored fixture decodes", function()
  local v, err = Codec.decodeUpdate(FIXTURES.envelopes.wfu1_stored)
  T.ok(v, "decode: " .. tostring(err and err.message))
  T.eq(v.schema, "wf.addon-update.v1")
  T.eq(v.snapshotSequence, 3)
  local re = Codec.encodeUpdate(v)
  T.eq(re, FIXTURES.envelopes.wfu1_stored)
end)

T.test("Huffman-compressed envelope fails honestly", function()
  local v, err = Codec.decodeExport(FIXTURES.envelopes.wfp2_compressed)
  T.isNil(v)
  T.eq(T.errCode(err), "unsupported_compression")
end)

T.test("envelope rejects wrong tag, bad crc, junk", function()
  local _, e1 = Codec.decodeUpdate(FIXTURES.envelopes.wfp2_stored)
  T.eq(T.errCode(e1), "bad_tag")
  local bad = FIXTURES.envelopes.wfp2_stored:gsub(".$", "0")
  local _, e2 = Codec.decodeExport(bad)
  T.eq(T.errCode(e2), "bad_crc")
  local _, e3 = Codec.decodeExport("WFP2:not-base64!!!:00000000")
  T.eq(T.errCode(e3), "malformed_envelope")
end)

-- frames ----------------------------------------------------------------------

T.test("frame encode/decode round trip", function()
  local frames, err = Frames.chunk({
    sessionShortId = "AbCd", messageId = "12345678", seq = 7,
    body = string.rep("x", 500),
  })
  T.ok(frames, "chunk: " .. tostring(err and err.message))
  local r = Frames.newReassembler()
  local body
  for i, text in ipairs(frames) do
    local f, ferr = Frames.decode(text)
    T.ok(f, "decode frame " .. i .. ": " .. tostring(ferr and ferr.message))
    T.eq(f.sessionShortId, "AbCd")
    T.eq(f.messageId, "12345678")
    T.eq(f.seq, 7)
    local done = r:push(f, "sender", 1000)
    if done then body = done end
  end
  T.eq(body, string.rep("x", 500))
end)

T.test("frame rejects corrupt checksum and bad layout", function()
  local frames = Frames.chunk({
    sessionShortId = "AbCd", messageId = "12345678", seq = 1, body = "hello",
  })
  local f = Frames.decode(frames[1])
  T.ok(f)
  local corrupted = frames[1]:gsub("|%x%x%x%x|", "|0000|")
  local _, e = Frames.decode(corrupted)
  T.eq(T.errCode(e), "bad_crc")
  local _, e2 = Frames.decode("not a frame")
  T.eq(T.errCode(e2), "malformed_envelope")
end)

T.test("reassembler expires stale assemblies", function()
  local r = Frames.newReassembler()
  r:push({
    sessionShortId = "s", messageId = "m1", seq = 1,
    chunkIndex = 0, chunkTotal = 2, checksum = "0000", data = "AA",
  }, "s1", 0)
  T.eq(r:size(), 1)
  r:sweep(31000)
  T.eq(r:size(), 0)
end)

T.test("token bucket: burst 8 then throttled", function()
  local b = Frames.newTokenBucket(0)
  for _ = 1, 8 do T.eq(b:tryTake(0), 0) end
  T.ok(b:tryTake(0) > 0)
  T.eq(b:tryTake(250), 0) -- 1 token after 250ms at 4/s
end)
