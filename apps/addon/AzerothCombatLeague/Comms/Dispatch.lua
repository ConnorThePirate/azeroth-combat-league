--[[
  Comms/Dispatch.lua — peer message routing (docs/06, 07).

  Message grammar on the chunked transport (control priority):
    OFFER:<json>    wf.match-contract.v2 proposal
    COUNTER:<json>  counteroffer — clears acceptances
    ACCEPT:<sid>    sender accepts contract sid
    DECLINE:<sid>
    READY:<sid>     sender marked ready
    REPORT:<json>   peer's own wf.match-report.v2 — corroboration input
    PING / PONG     lab connectivity probe

  Sender identity always comes from the game event. A side is never claimed
  in a message — it is derived from the contract: the peer's side is the
  participant whose characterId is not ours. Bodies that don't decode or
  don't bind to a known session are logged and dropped, never applied.
]]
local _, ACL = ...

local Dispatch = {}

local function sessionFor(sid)
  return ACL.sessions and ACL.sessions[sid] or nil
end

--- The sender's side: the participant that is NOT us.
local function peerSide(session)
  for _, p in ipairs(session.contract.participants) do
    if p.characterId ~= session.selfCharacterId then return p.side end
  end
  return nil
end

local function decodeContract(jsonText)
  local doc = ACL.Json.decode(jsonText)
  if type(doc) ~= "table" or doc.schema ~= "wf.match-contract.v2" then
    return nil, "bad_schema"
  end
  if type(doc.sessionId) ~= "string" or type(doc.participants) ~= "table"
     or #doc.participants ~= 2 then
    return nil, "bad_shape"
  end
  return doc
end

local function areWeParticipant(doc)
  local self_ = ACL.Identity.self()
  if not self_ then return nil end
  for _, p in ipairs(doc.participants) do
    if p.characterId == self_.characterId then return self_.characterId end
  end
  return nil
end

function Dispatch.handle(sender, body)
  if type(body) ~= "string" then return end
  local verb, rest = body:match("^(%u+):?(.*)$")
  if not verb then return end

  if verb == "PING" then
    ACL.Reliability.sendMessage(sender, "PONG", "control")
    return
  elseif verb == "PONG" then
    ACL.Diagnostics.add("info", "peer", "pong from " .. tostring(sender))
    ACL.Capabilities.report("addon_whisper", "tested_pass", "PONG received")
    return
  end

  if verb == "OFFER" then
    local doc, err = decodeContract(rest)
    if not doc then
      ACL.Diagnostics.add("warn", "offer", "rejected: " .. err)
      return
    end
    local myChar = areWeParticipant(doc)
    if not myChar then
      ACL.Diagnostics.add("warn", "offer", "not addressed to us — dropped")
      return
    end
    if sessionFor(doc.sessionId) then return end -- duplicate offer
    local s = ACL.Contract.newSession(doc, myChar)
    s.peerName = sender
    s.inbound = true
    ACL.sessions = ACL.sessions or {}
    ACL.sessions[doc.sessionId] = s
    ACL.db.sessions[doc.sessionId] = {
      contractHash = s.contractHash, lifecycle = "proposed", peerName = sender,
    }
    ACL.db.contracts[doc.sessionId] = doc
    ACL.Events.emit("challenge.received", s, sender)
    return
  end

  if verb == "COUNTER" then
    local doc = decodeContract(rest)
    local s = doc and sessionFor(doc.sessionId)
    if s and doc then s:counter(doc) end
    return
  end

  if verb == "REPORT" then
    local rep = ACL.Json.decode(rest)
    if type(rep) ~= "table" or rep.schema ~= "wf.match-report.v2" then
      ACL.Diagnostics.add("warn", "report", "bad report body from " .. tostring(sender))
      return
    end
    local s = sessionFor(rep.sessionId)
    if not s then
      ACL.Diagnostics.add("info", "peer", "REPORT for unknown session")
      return
    end
    if rep.contractHash ~= s.contractHash then
      -- hash conflict for the same session: quarantine, never merge
      ACL.Diagnostics.add("warn", "report", "contract hash conflict — quarantined")
      s.evidence = "disputed"
      ACL.Events.emit("session.updated", s)
      return
    end
    s.peerDigests[#s.peerDigests + 1] = {
      digest = ACL.Codec.contentHash(rep), from = sender,
    }
    -- corroboration: compare claimed winners game-by-game
    local conflict = false
    for _, g in ipairs(rep.games or {}) do
      local ours = s.games[g.index]
      if ours and ours.winner and g.claimedWinnerCharacterId
         and ours.winner ~= g.claimedWinnerCharacterId then
        conflict = true
      end
    end
    s.evidence = conflict and "disputed" or "peer_supported"
    if conflict then
      ACL.Diagnostics.add("warn", "report", "conflicting winner claims — disputed")
    end
    ACL.Events.emit("session.updated", s)
    return
  end

  -- the rest bind to a session id
  local sid = rest
  local s = sessionFor(sid)
  if not s then
    ACL.Diagnostics.add("info", "peer", verb .. " for unknown session " .. sid)
    return
  end

  if verb == "ACCEPT" then
    local side = peerSide(s)
    if side then s:accept(side, math.floor(GetServerTime() * 1000)) end
    ACL.Events.emit("session.updated", s)
  elseif verb == "DECLINE" then
    s:transition("declined", math.floor(GetServerTime() * 1000))
    ACL.Events.emit("session.updated", s)
  elseif verb == "READY" then
    local side = peerSide(s)
    if side then s:markReady(side) end
    ACL.Events.emit("session.updated", s)
  end
end

ACL.Events.subscribe("peer.message", function(sender, body)
  Dispatch.handle(sender, body)
end)

--- Send our report to the peer after local confirm — corroboration input,
--- never proof of the peer's honesty.
function Dispatch.shareReport(session)
  if not session.peerName then return end
  local rep = ACL.Export.reportFromSession(session)
  ACL.Reliability.sendMessage(session.peerName,
    "REPORT:" .. ACL.Json.encode(rep), "control")
end

ACL.Dispatch = Dispatch
