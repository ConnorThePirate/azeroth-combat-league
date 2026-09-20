-- UI/SyncBadge: pending indicator visibility, click-to-flush, dismissal.
local ACL = __ACL_NS

local function badgeFrame() return __wow.frames["ACLSyncBadge"] end
local function click(btn) badgeFrame().__OnClick(badgeFrame(), btn) end

local function fresh()
  _G.AzerothCombatLeagueDB = nil
  ACL.State.init()
end

local function enqueue(nonce)
  ACL.Outbox.enqueue({ nonce = nonce, sessionId = "s-" .. nonce, contractHash = "h" })
end

T.test("badge hidden when nothing pending", function()
  fresh()
  ACL.UI.SyncBadge.init()
  T.ok(not badgeFrame():IsShown())
end)

T.test("badge appears on enqueue, labels memory vs saved honestly", function()
  fresh()
  ACL.UI.SyncBadge.init()
  enqueue("n1")
  local f = badgeFrame()
  T.ok(f:IsShown())
  T.ok(f.text:GetText():find("unsaved"), "expected memory-warning label, got: " .. f.text:GetText())
  -- after a flush the report is on disk — the label calms down
  ACL.Outbox.markSaved("n1")
  ACL.UI.SyncBadge.refresh()
  T.ok(f.text:GetText():find("awaiting upload"), "expected saved label, got: " .. f.text:GetText())
end)

T.test("click flushes: pending marked saved, reload fired", function()
  fresh()
  ACL.UI.SyncBadge.init()
  enqueue("n1"); enqueue("n2")
  __wow.reloaded = false
  click("LeftButton")
  T.ok(__wow.reloaded, "reload should fire when safe")
  T.eq(ACL.db.reports["n1"].status, "saved")
  T.eq(ACL.db.reports["n2"].status, "saved")
end)

T.test("click in combat does not reload; player gets a chat reason", function()
  fresh()
  ACL.UI.SyncBadge.init()
  enqueue("n1")
  __wow.combatLockdown = true
  __wow.reloaded = false
  __wow.chatLog = ""
  click("LeftButton")
  __wow.combatLockdown = false
  T.ok(not __wow.reloaded, "no reload in combat")
  T.eq(ACL.db.reports["n1"].status, "unsynced", "report stays memory-queued")
  T.ok((__wow.chatLog or ""):find("can't save"), "player told why")
end)

T.test("right-click dismisses until a NEW result arrives", function()
  fresh()
  ACL.UI.SyncBadge.init()
  enqueue("n1")
  click("RightButton")
  T.ok(not badgeFrame():IsShown(), "dismissed")
  enqueue("n2") -- a new pending result re-shows the badge
  T.ok(badgeFrame():IsShown(), "reappears on new pending")
end)

T.test("acked reports hide the badge entirely", function()
  fresh()
  ACL.UI.SyncBadge.init()
  enqueue("n1")
  T.ok(badgeFrame():IsShown())
  ACL.Outbox.applyReceipt("n1", "corroborated", "rcpt-1")
  T.ok(not badgeFrame():IsShown())
end)

T.test("memory pile-up nudges once, re-arms after flush", function()
  fresh()
  ACL.UI.SyncBadge.init()
  __wow.chatLog = ""
  enqueue("n1"); enqueue("n2")
  T.ok(not (__wow.chatLog or ""):find("only in memory"), "no nudge below threshold")
  enqueue("n3")
  T.ok((__wow.chatLog or ""):find("only in memory"), "nudge at 3 unsaved")
  __wow.chatLog = ""
  enqueue("n4")
  T.ok(not (__wow.chatLog or ""):find("only in memory"), "nudges once, not per report")
  -- flush to disk clears the pile; a new pile-up nudges again
  for _, n in ipairs({"n1","n2","n3","n4"}) do ACL.Outbox.markSaved(n) end
  ACL.UI.SyncBadge.refresh()
  enqueue("n5"); enqueue("n6"); enqueue("n7")
  T.ok((__wow.chatLog or ""):find("only in memory"), "re-arms for the next pile")
end)

T.test("settings.syncBadge=false keeps it hidden", function()
  fresh()
  ACL.db.settings.syncBadge = false
  ACL.UI.SyncBadge.init()
  enqueue("n1")
  T.ok(not badgeFrame():IsShown())
  ACL.db.settings.syncBadge = true
  ACL.UI.SyncBadge.refresh()
  T.ok(badgeFrame():IsShown())
end)
