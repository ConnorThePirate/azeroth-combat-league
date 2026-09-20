--[[
  Data/Inbound.lua — companion-written payload channel (docs/06, 27).

  The desktop companion writes ONE file here after each upload:
  ACL_INBOUND_PAYLOAD = "WFU1:<base64url>:<crc>". WoW reads it at addon load
  (reload/login); Sync/Import.lua applies it once by digest. Data only —
  the payload is validated field-by-field before anything is applied.
]]
ACL_INBOUND_PAYLOAD = nil
