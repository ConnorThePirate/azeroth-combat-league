--[[
  Core/Events.lua — single event dispatcher (docs/05).

  One hidden frame receives Blizzard events and fans them out to registered
  handlers; a separate internal bus carries addon-domain events. Handlers run
  under pcall so a bad observer can't break recording.
]]
local _, ACL = ...

local Events = {}

local frame = CreateFrame("Frame", "ACLEventFrame")
local handlers = {}  -- blizzard event -> {fn,...}
local bus = {}       -- internal topic -> {fn,...}

frame:SetScript("OnEvent", function(_, event, ...)
  local list = handlers[event]
  if not list then return end
  for _, fn in ipairs(list) do
    local ok, err = pcall(fn, ...)
    if not ok and ACL.Diagnostics then
      ACL.Diagnostics.add("error", "event:" .. event, tostring(err))
    end
  end
end)

--- Subscribe to a Blizzard event on the shared frame.
function Events.on(event, fn)
  if not handlers[event] then
    handlers[event] = {}
    frame:RegisterEvent(event)
  end
  handlers[event][#handlers[event] + 1] = fn
end

--- Subscribe to an internal topic.
function Events.subscribe(topic, fn)
  bus[topic] = bus[topic] or {}
  bus[topic][#bus[topic] + 1] = fn
end

--- Emit an internal event to subscribers.
function Events.emit(topic, ...)
  local list = bus[topic]
  if not list then return end
  for _, fn in ipairs(list) do
    local ok, err = pcall(fn, ...)
    if not ok and ACL.Diagnostics then
      ACL.Diagnostics.add("error", "bus:" .. topic, tostring(err))
    end
  end
end

ACL.Events = Events
