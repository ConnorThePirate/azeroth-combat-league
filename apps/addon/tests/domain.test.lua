-- Domain: contract lifecycle, series scoring, rules evaluation.
local ACL = __ACL_NS
local Contract, Series, Rules = ACL.Contract, ACL.Series, ACL.Rules

local function makeContract(bestOf)
  return Contract.build({
    sessionId = "11111111-1111-4111-8111-111111111111",
    seasonId = "22222222-2222-4222-8222-222222222222",
    poolId = "33333333-3333-4333-8333-333333333333",
    ladder = "open", ratedIntent = true, bestOf = bestOf or 3,
    rulesetVersionId = "44444444-4444-4444-8444-444444444444",
    participants = {
      { characterId = "55555555-5555-4555-8555-555555555555", side = 1 },
      { characterId = "66666666-6666-4666-8666-666666666666", side = 2 },
    },
    levelMin = 30, levelMax = 30,
    venue = { kind = "anywhere", mapId = ACL.Json.null, areaId = ACL.Json.null },
    tournamentMatchId = ACL.Json.null,
    createdAtMs = 1789833600000, acceptByMs = 1789834500000,
    configVersion = "beta-v2",
  })
end

local A = "55555555-5555-4555-8555-555555555555"
local B = "66666666-6666-4666-8666-666666666666"

T.test("contract builds and hashes deterministically", function()
  local c = makeContract(3)
  T.eq(c.schema, "wf.match-contract.v2")
  T.eq(#c.participants, 2)
  T.eq(Contract.hash(c), Contract.hash(c))
  local c2 = makeContract(3)
  c2.bestOf = 5
  T.ok(Contract.hash(c) ~= Contract.hash(c2))
end)

T.test("session lifecycle follows docs/07", function()
  local s = Contract.newSession(makeContract(3), A)
  T.eq(s.lifecycle, "proposed")
  T.eq(s.evidence, "awaiting")
  T.eq(s.rating, "ineligible")

  -- cannot finish from proposed
  local ok = s:transition("finished", 100)
  T.isNil(ok)

  s:accept(1, 100)
  T.eq(s.lifecycle, "proposed") -- needs both sides
  s:accept(2, 200)
  T.eq(s.lifecycle, "accepted")

  s:markReady(1); s:markReady(2)
  T.eq(s.lifecycle, "ready")
  s:transition("armed", 300)
  s:transition("active", 400)

  -- interruption can resume
  s:transition("interrupted", 500)
  T.eq(s.lifecycle, "interrupted")
  s:transition("active", 600)

  s:recordGame(0, A, "death", false, 700)
  T.eq(s.lifecycle, "active") -- bo3 needs 2 wins
  s:recordGame(1, A, "death", false, 800)
  T.eq(s.lifecycle, "finished")
  T.eq(s.series.winner, A)
end)

T.test("counteroffer clears acceptances", function()
  local s = Contract.newSession(makeContract(3), A)
  s:accept(1, 100); s:accept(2, 100)
  T.eq(s.lifecycle, "accepted")
  s:counter(makeContract(5))
  T.eq(s.lifecycle, "proposed")
  T.eq(s.acceptedBy[1], nil)
  T.eq(s.contract.bestOf, 5)
end)

T.test("series scoring with voided games", function()
  local s = Series.new(3)
  s:recordGame(0, A, "death", false)
  s:recordGame(1, B, "death", true)  -- voided: no score
  T.eq(s.wins[B] or 0, 0)
  s:recordGame(2, B, "death", false)
  s:recordGame(3, B, "death", false)
  T.eq(s.finished, true)
  T.eq(s.winner, B)
end)

T.test("rules: standard denies consumables in active phase", function()
  local std = Rules.TEMPLATES.standard
  local v = Rules.checkFact(std,
    { category = "consumable", itemId = 12345 }, "active")
  T.ok(v, "expected violation")
  T.eq(v.sanction, "game_loss")
  -- preparation phase is allowed
  T.isNil(Rules.checkFact(std, { category = "consumable" }, "preparation"))
  -- bandages (category item_use) not denied in standard
  T.isNil(Rules.checkFact(std, { category = "item_use" }, "active"))
end)

T.test("rules: item exception beats category denial", function()
  local rs = { rules = {
    { ruleId = "r1", category = "consumable", action = "deny", phase = "active",
      itemIds = { 999 }, sanction = "game_loss" },
  } }
  T.isNil(Rules.checkFact(rs, { category = "consumable", itemId = 999 }, "active"))
  T.ok(Rules.checkFact(rs, { category = "consumable", itemId = 111 }, "active"))
end)

T.test("rules coverage: unknown detectors report unavailable", function()
  local cov = Rules.coverage(Rules.TEMPLATES.standard, "active", {})
  T.ok(#cov > 0)
  for _, c in ipairs(cov) do T.eq(c.status, "unavailable") end
end)

T.test("uuid minting produces valid unique ids", function()
  local a, b = ACL.Uuid.v4(), ACL.Uuid.v4()
  T.ok(ACL.Uuid.isValid(a))
  T.ok(ACL.Uuid.isValid(b))
  T.ok(a ~= b)
end)

T.test("outbox keeps unsynced reports; trims only acked", function()
  ACL.State.init()
  local db = ACL.db
  for i = 1, 3 do
    ACL.Outbox.enqueue({ nonce = "n" .. i, sessionId = "s" .. i,
      contractHash = "h", body = { nonce = "n" .. i } })
  end
  T.eq(ACL.State.unsyncedCount(), 3)
  ACL.Outbox.applyReceipt("n1", "accepted", "r1")
  T.eq(ACL.State.unsyncedCount(), 2)
  T.eq(ACL.db.reports["n1"].status, "acked")
end)

T.test("peer dispatch: OFFER creates inbound session, ACCEPT completes", function()
  ACL.State.init()
  ACL.sessions = {}
  local myChar = ACL.Identity.self().characterId
  local doc = {
    schema = "wf.match-contract.v2",
    sessionId = "99999999-9999-4999-8999-999999999999",
    seasonId = "22222222-2222-4222-8222-222222222222",
    poolId = "33333333-3333-4333-8333-333333333333",
    ladder = "open", ratedIntent = true, bestOf = 3,
    rulesetVersionId = "44444444-4444-4444-8444-444444444444",
    participants = ACL.Json.array({
      { characterId = "66666666-6666-4666-8666-666666666666", side = 1 },
      { characterId = myChar, side = 2 },
    }),
    levelMin = 30, levelMax = 30,
    venue = { kind = "anywhere", mapId = ACL.Json.null, areaId = ACL.Json.null },
    tournamentMatchId = ACL.Json.null,
    createdAtMs = 1789833600000, acceptByMs = 1789834500000,
    configVersion = "beta-v2",
  }
  ACL.Dispatch.handle("PeerName", "OFFER:" .. ACL.Json.encode(doc))
  local s = ACL.sessions[doc.sessionId]
  T.ok(s, "session created")
  T.eq(s.lifecycle, "proposed")
  T.eq(s.peerName, "PeerName")
  T.eq(s:selfSide(), 2)

  -- peer accepts: their side (1) gets marked
  ACL.Dispatch.handle("PeerName", "ACCEPT:" .. doc.sessionId)
  T.eq(s.acceptedBy[1], true)
  T.eq(s.lifecycle, "proposed") -- our side hasn't accepted yet

  -- unknown session is ignored safely
  ACL.Dispatch.handle("PeerName", "ACCEPT:deadbeef")
  -- junk body is dropped
  ACL.Dispatch.handle("PeerName", "OFFER:not-json{")
  -- offer not addressed to us is dropped
  doc.participants[2].characterId = "77777777-7777-4777-8777-777777777777"
  ACL.Dispatch.handle("PeerName", "OFFER:" .. ACL.Json.encode(doc))
  T.isNil(ACL.sessions["other"])
end)

T.test("peer dispatch: conflicting REPORT marks dispute", function()
  ACL.State.init()
  ACL.sessions = {}
  local myChar = ACL.Identity.self().characterId
  local c = makeContract(3)
  -- make us participant 1
  c.participants[1].characterId = myChar
  local s = Contract.newSession(c, myChar)
  ACL.sessions[c.sessionId] = s
  s:transition("accepted", 1); s:transition("ready", 2); s:transition("armed", 3)
  s:transition("active", 4)
  s:recordGame(0, myChar, "death", false, 5)

  -- peer's report claims THEY won game 0
  local rep = {
    schema = "wf.match-report.v2", sessionId = c.sessionId,
    contractHash = s.contractHash,
    originCharacterId = B, installationId = ACL.Uuid.v4(),
    nonce = ACL.Uuid.v4(), build = "1", addonVersion = "0",
    detectorCatalogVersion = "cat-0",
    proposedAtMs = ACL.Json.null, acceptedAtMs = ACL.Json.null,
    startedAtMs = ACL.Json.null, finishedAtMs = ACL.Json.null,
    games = ACL.Json.array({ { index = 0,
      claimedWinnerCharacterId = B, finishReason = "death" } }),
    coverage = ACL.Json.array({}), attestations = ACL.Json.array({}),
    peerDigests = ACL.Json.array({}),
  }
  ACL.Dispatch.handle("PeerName", "REPORT:" .. ACL.Json.encode(rep))
  T.eq(s.evidence, "disputed")
end)

T.test("import rejects stale and mismatched snapshots", function()
  ACL.State.init()
  ACL.db.accountId = "acct-1"
  -- craft a valid WFU1 via the encoder
  local update = {
    schema = "wf.addon-update.v1", accountId = "acct-1",
    snapshotSequence = 5, issuedAtMs = 1,
    characters = ACL.Json.array({}), receipts = ACL.Json.array({}),
    configVersion = "beta-v2",
  }
  local text = ACL.Codec.encodeUpdate(update)
  local res = ACL.Import.apply(text)
  T.eq(res.status, "imported")
  -- same sequence again -> already imported
  local res2 = ACL.Import.apply(text)
  T.eq(res2.status, "already_imported")
  -- older -> rejected
  update.snapshotSequence = 4
  local _, e3 = ACL.Import.apply(ACL.Codec.encodeUpdate(update))
  T.eq(T.errCode(e3), "stale_snapshot")
  -- wrong account -> rejected
  update.snapshotSequence = 6
  update.accountId = "acct-2"
  local _, e4 = ACL.Import.apply(ACL.Codec.encodeUpdate(update))
  T.eq(T.errCode(e4), "account_mismatch")
end)

T.test("import applies published rulesets; picker offers them", function()
  ACL.State.init()
  ACL.db.accountId = "acct-1"
  local update = {
    schema = "wf.addon-update.v1", accountId = "acct-1",
    snapshotSequence = 10, issuedAtMs = 1,
    characters = ACL.Json.array({}), receipts = ACL.Json.array({}),
    configVersion = "beta-v2",
    rulesets = ACL.Json.array({
      { rulesetId = "aaaaaaaa-0000-4000-8000-000000000001",
        versionId = "bbbbbbbb-0000-4000-8000-000000000001",
        version = 1, name = "Community Classic",
        description = "Community casual — declared consumables ok",
        standard = false,
        rules = ACL.Json.array({
          { ruleId = "cc.bandages", category = "bandage", action = "limit",
            phase = "active", countLimit = 3, sanction = "none" },
        }) },
      { rulesetId = "cccccccc-0000-4000-8000-000000000002",
        versionId = "dddddddd-0000-4000-8000-000000000002",
        version = 1, name = "Bad Entry", description = "x", standard = false,
        rules = ACL.Json.array({
          { ruleId = "x", category = "c", action = "explode",
            phase = "active", sanction = "none" },
        }) },
    }),
  }
  local res = ACL.Import.apply(ACL.Codec.encodeUpdate(update))
  T.eq(res.status, "imported")
  T.eq(res.rulesets, 1)  -- the malformed entry is dropped, not half-applied

  local e = Rules.resolve("pub:bbbbbbbb-0000-4000-8000-000000000001")
  T.eq(e.label, "Community Classic")
  T.eq(e.ratedEligible, false)  -- community casual never feeds Standard
  T.eq(e.source, "published")
  T.eq(#e.rules, 1)

  -- builtins still present; standard resolves as the safe default
  local std = Rules.resolve("standard")
  T.eq(std.ratedEligible, true)
  local fallback = Rules.resolve("pub:does-not-exist")
  T.eq(fallback.key, "standard")

  -- a newer version of the same ruleset supersedes the old
  local update2 = {
    schema = "wf.addon-update.v1", accountId = "acct-1",
    snapshotSequence = 11, issuedAtMs = 2,
    characters = ACL.Json.array({}), receipts = ACL.Json.array({}),
    configVersion = "beta-v2",
    rulesets = ACL.Json.array({
      { rulesetId = "aaaaaaaa-0000-4000-8000-000000000001",
        versionId = "bbbbbbbb-0000-4000-8000-000000000002",
        version = 2, name = "Community Classic",
        description = "v2", standard = false, rules = ACL.Json.array({}) },
    }),
  }
  local res2 = ACL.Import.apply(ACL.Codec.encodeUpdate(update2))
  T.eq(res2.rulesets, 1)
  T.isNil(ACL.db.publishedRulesets["bbbbbbbb-0000-4000-8000-000000000001"])
  T.ok(ACL.db.publishedRulesets["bbbbbbbb-0000-4000-8000-000000000002"])

  -- stale version of the same ruleset does not downgrade the stored one
  local update3 = {
    schema = "wf.addon-update.v1", accountId = "acct-1",
    snapshotSequence = 12, issuedAtMs = 3,
    characters = ACL.Json.array({}), receipts = ACL.Json.array({}),
    configVersion = "beta-v2",
    rulesets = ACL.Json.array({
      { rulesetId = "aaaaaaaa-0000-4000-8000-000000000001",
        versionId = "bbbbbbbb-0000-4000-8000-000000000009",
        version = 1, name = "Community Classic OLD",
        description = "stale", standard = false, rules = ACL.Json.array({}) },
    }),
  }
  ACL.Import.apply(ACL.Codec.encodeUpdate(update3))
  T.eq(ACL.db.publishedRulesets["bbbbbbbb-0000-4000-8000-000000000002"].name,
    "Community Classic")
  T.isNil(ACL.db.publishedRulesets["bbbbbbbb-0000-4000-8000-000000000009"])
end)

T.test("inbound payload applies once by digest", function()
  ACL.State.init()
  ACL.db.accountId = "acct-1"
  local update = {
    schema = "wf.addon-update.v1", accountId = "acct-1",
    snapshotSequence = 20, issuedAtMs = 1,
    characters = ACL.Json.array({}), receipts = ACL.Json.array({}),
    configVersion = "beta-v2",
    rulesets = ACL.Json.array({
      { rulesetId = "aaaaaaaa-0000-4000-8000-000000000010",
        versionId = "bbbbbbbb-0000-4000-8000-000000000010",
        version = 1, name = "Staged Ruleset", description = "via file",
        standard = false, rules = ACL.Json.array({}) },
    }),
  }
  _G.ACL_INBOUND_PAYLOAD = ACL.Codec.encodeUpdate(update)
  local res = ACL.Import.applyPending()
  T.ok(res, "payload applied")
  T.eq(res.rulesets, 1)
  T.ok(ACL.db.publishedRulesets["bbbbbbbb-0000-4000-8000-000000000010"])
  -- same payload is not re-applied on the next load
  T.isNil(ACL.Import.applyPending())
  -- a malformed staged payload is rejected once, not retried forever
  _G.ACL_INBOUND_PAYLOAD = "WFU1:notrealpayload"
  T.isNil(ACL.Import.applyPending())
  T.isNil(ACL.Import.applyPending())
  _G.ACL_INBOUND_PAYLOAD = nil
end)
