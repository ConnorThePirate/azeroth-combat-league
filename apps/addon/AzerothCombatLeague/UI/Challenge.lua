--[[
  UI/Challenge.lua — challenge flow (docs/05, 12).

  Target a player, pick a preset + best-of, send. Contract goes over the peer
  transport; the duel itself is still the ordinary game duel. Custom presets
  are never silently rated.
]]
local _, ACL = ...

local Challenge = {}
local panel

local function L(key) return ACL.L[key] or key end

local BESTOF = { 1, 3, 5 }

function Challenge.build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints()

  local targetText = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightLarge")
  targetText:SetPoint("TOPLEFT", 16, -16)
  panel.targetText = targetText

  local hint = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  hint:SetPoint("TOPLEFT", targetText, "BOTTOMLEFT", 0, -4)
  hint:SetText(L("challengeNoTarget"))
  panel.hint = hint

  -- preset picker (simple cycling button; a dropdown needs a template lib)
  local presetLabel = panel:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  presetLabel:SetPoint("TOPLEFT", 16, -70)
  presetLabel:SetText(L("preset"))
  local presetBtn = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  presetBtn:SetPoint("LEFT", presetLabel, "RIGHT", 12, 0)
  presetBtn:SetSize(160, 24)
  panel.presetBtn = presetBtn

  local boLabel = panel:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  boLabel:SetPoint("TOPLEFT", presetLabel, "BOTTOMLEFT", 0, -18)
  boLabel:SetText(L("bestOf"))
  local boBtn = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  boBtn:SetPoint("LEFT", boLabel, "RIGHT", 12, 0)
  boBtn:SetSize(60, 24)
  panel.boBtn = boBtn

  local rated = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  rated:SetPoint("TOPLEFT", boLabel, "BOTTOMLEFT", 0, -14)
  panel.ratedNote = rated

  local send = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  send:SetPoint("TOPLEFT", rated, "BOTTOMLEFT", 0, -16)
  send:SetSize(160, 28)
  send:SetText(L("sendChallenge"))
  send:SetScript("OnClick", function() Challenge.send() end)
  panel.sendBtn = send

  local status = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  status:SetPoint("TOPLEFT", send, "BOTTOMLEFT", 0, -10)
  panel.statusText = status

  -- incoming offer card -------------------------------------------------
  local incoming = CreateFrame("Frame", nil, panel, "InsetFrameTemplate")
  incoming:SetSize(320, 92)
  incoming:SetPoint("BOTTOMLEFT", 16, 16)
  incoming:Hide()
  local ititle = incoming:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  ititle:SetPoint("TOPLEFT", 10, -10)
  incoming.title = ititle
  local idetail = incoming:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  idetail:SetPoint("TOPLEFT", ititle, "BOTTOMLEFT", 0, -4)
  incoming.detail = idetail
  local accept = CreateFrame("Button", nil, incoming, "UIPanelButtonTemplate")
  accept:SetSize(90, 22)
  accept:SetPoint("BOTTOMLEFT", 10, 8)
  accept:SetText(L("accept"))
  local decline = CreateFrame("Button", nil, incoming, "UIPanelButtonTemplate")
  decline:SetSize(90, 22)
  decline:SetPoint("LEFT", accept, "RIGHT", 8, 0)
  decline:SetText(L("decline"))
  incoming.accept, incoming.decline = accept, decline
  panel.incoming = incoming

  presetBtn:SetScript("OnClick", function()
    -- cycle through builtins + published community rulesets
    local list = ACL.Rules.available()
    local cur = ACL.db.settings.rulesetPreset
    local nextI = 1
    for i, e in ipairs(list) do
      if e.key == cur then nextI = i % #list + 1 break end
    end
    ACL.db.settings.rulesetPreset = list[nextI] and list[nextI].key or "standard"
    Challenge.refresh(panel)
  end)
  boBtn:SetScript("OnClick", function()
    local cur = ACL.db.settings.bestOf
    for i, b in ipairs(BESTOF) do if b == cur then cur = BESTOF[i % #BESTOF + 1] break end end
    ACL.db.settings.bestOf = cur
    Challenge.refresh(panel)
  end)

  return panel
end

function Challenge.refresh(p)
  panel = p or panel
  if not panel then return end
  local t = ACL.Identity.forUnit("target")
  if t then
    panel.targetText:SetText(t.name or "?")
    panel.hint:SetText("")
    panel.sendBtn:Enable()
  else
    panel.targetText:SetText("—")
    panel.hint:SetText(L("challengeNoTarget"))
    panel.sendBtn:Disable()
  end
  local entry = ACL.Rules.resolve(ACL.db.settings.rulesetPreset)
  panel.presetBtn:SetText(entry.label)
  panel.boBtn:SetText("Bo" .. tostring(ACL.db.settings.bestOf))
  if entry.source == "published" and entry.ratedEligible then
    panel.ratedNote:SetText("Community standard (v" .. tostring(entry.version or "?")
      .. ") — counts toward rating once both reports arrive.")
  elseif entry.ratedEligible then
    panel.ratedNote:SetText("Counts toward Open rating once both sides' reports arrive.")
  elseif entry.source == "published" then
    panel.ratedNote:SetText("Community ruleset — casual, never rated.")
  else
    panel.ratedNote:SetText("Casual rules — never rated on the Standard ladder.")
  end
end

--- Build + send a contract offer for the current target.
function Challenge.send()
  local t = ACL.Identity.forUnit("target")
  local self_ = ACL.Identity.self()
  if not (t and self_) then return end
  local entry = ACL.Rules.resolve(ACL.db.settings.rulesetPreset)
  local now = math.floor(GetServerTime() * 1000)
  local level = self_.level or 0
  local cfg = ACL.db.config or {}
  local contract = ACL.Contract.build({
    sessionId = ACL.Uuid.v4(),
    seasonId = cfg.seasonId or "00000000-0000-4000-8000-000000000000",
    poolId = cfg.poolId or "00000000-0000-4000-8000-000000000000",
    ladder = entry.ratedEligible and "open" or nil,
    ratedIntent = entry.ratedEligible,
    bestOf = ACL.db.settings.bestOf,
    -- published rulesets carry their real version id; the builtin Standard
    -- template binds to the server-issued Standard version from config
    rulesetVersionId = entry.versionId
      or cfg.rulesetVersionId or "00000000-0000-4000-8000-000000000000",
    participants = {
      { characterId = self_.characterId, side = 1 },
      { characterId = t.characterId, side = 2 },
    },
    levelMin = level, levelMax = level,
    venue = ACL.Map.currentVenue(),
    createdAtMs = now,
    acceptByMs = now + ACL.Contract.TIMING.acceptWindowMs,
    configVersion = "beta-v2",
  })
  local session = ACL.Contract.newSession(contract, self_.characterId)
  session.proposedAtMs = now
  session.peerName = t.name
  ACL.db.sessions[contract.sessionId] = {
    contractHash = session.contractHash, lifecycle = "proposed",
    peerName = t.name,
  }
  -- the canonical contract doc must persist: the server validates new
  -- sessions by hashing the document, never by trusting a claimed hash
  ACL.db.contracts[contract.sessionId] = contract
  ACL.sessions = ACL.sessions or {}
  ACL.sessions[contract.sessionId] = session

  -- OFFER over peer transport (control priority)
  local body = "OFFER:" .. ACL.Json.encode(contract)
  local mid = ACL.Reliability.sendMessage(t.name, body, "control")
  if mid then
    panel.statusText:SetText(L("challengeSent"))
  else
    -- comms unavailable: practice locally, say so honestly
    panel.statusText:SetText("Comms unavailable — recording locally.")
  end
  ACL.Diagnostics.add("info", "challenge", "offered " .. contract.sessionId)
end

--- Show an inbound offer: accept sends ACCEPT + READY; decline sends DECLINE.
function Challenge.showIncoming(session, sender)
  if not panel or not panel.incoming then return end
  local c = session.contract
  -- resolve the offered ruleset name: published version id if we know it,
  -- else honest rated/custom label
  local rsName = nil
  if ACL.db.publishedRulesets then
    local rs = ACL.db.publishedRulesets[c.rulesetVersionId]
    if rs then rsName = rs.name end
  end
  panel.incoming.title:SetText(string.format(L("challengeIncoming"), tostring(sender)))
  panel.incoming.detail:SetText(
    (rsName or (c.ratedIntent and "Ranked Standard" or "Custom rules")) ..
    " · Bo" .. tostring(c.bestOf) ..
    " — your side sees the same rules before accepting")
  panel.incoming.session = session
  panel.incoming.accept:SetScript("OnClick", function()
    local now = math.floor(GetServerTime() * 1000)
    local side = session:selfSide()
    session:accept(side, now)
    session:markReady(side)
    ACL.Reliability.sendMessage(sender, "ACCEPT:" .. c.sessionId, "control")
    ACL.Reliability.sendMessage(sender, "READY:" .. c.sessionId, "control")
    panel.incoming:Hide()
    panel.statusText:SetText("Accepted — start the duel when you're both ready.")
  end)
  panel.incoming.decline:SetScript("OnClick", function()
    session:transition("declined", math.floor(GetServerTime() * 1000))
    ACL.Reliability.sendMessage(sender, "DECLINE:" .. c.sessionId, "control")
    panel.incoming:Hide()
  end)
  panel.incoming:Show()
  if not (ACL.db and ACL.db.settings.quietMode) then
    ACL.UI.Shell.show("Challenge")
  end
end

ACL.Events.subscribe("challenge.received", function(session, sender)
  Challenge.showIncoming(session, sender)
end)

ACL.UI = ACL.UI or {}
ACL.UI.Challenge = Challenge
