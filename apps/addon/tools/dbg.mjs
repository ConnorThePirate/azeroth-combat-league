import { createState, loadAddon, TOC_ORDER } from './lua-env.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const fengari = createRequire(import.meta.url)('fengari');
const { lua, lauxlib, to_luastring, to_jsstring } = fengari;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const withBit = process.argv[2] !== 'fallback';
const env = createState({ withBit });
const files = TOC_ORDER.filter(f => existsSync(join(ROOT, 'AzerothCombatLeague', f)));
loadAddon(env, files);

function evalLua(expr) {
  const buf = to_luastring('return ' + expr);
  const st = lauxlib.luaL_loadbuffer(env.L, buf, buf.length, 'eval');
  if (st !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(env.L, -1)));
  const cs = lua.lua_pcall(env.L, 0, 1, 0);
  if (cs !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(env.L, -1)));
  const out = to_jsstring(lua.lua_tostring(env.L, -1));
  lua.lua_pop(env.L, 1);
  return out;
}

// compare crc32 for every single byte and some longer inputs
const bad = [];
for (let i = 0; i < 256; i++) {
  env.run('__bs = string.char(' + i + ')', 'inj');
  const luaCrc = evalLua('__ACL_NS.Crc32.hex(__bs)');
  const expected = zlib.crc32(Buffer.from([i])).toString(16).padStart(8, '0');
  if (luaCrc !== expected) bad.push([i, luaCrc, expected]);
}
console.log('single-byte mismatches:', bad.length, bad.slice(0, 12));

// crc32 of the WFU1 fixture's compressed section, in chunks and whole
const { readFixture } = await import('./lua-env.mjs');
const fx = readFixture('envelopes.json');
const b64 = fx.wfu1_stored.split(':')[1];
const bytes = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
env.run('__payload = __ACL_NS.Base64Url.decode(' + JSON.stringify(b64) + ')', 'inj');
console.log('lua len', evalLua('#__payload'), 'node len', bytes.length);
console.log('lua crc', evalLua('__ACL_NS.Crc32.hex(__payload)'), 'expected', zlib.crc32(bytes).toString(16).padStart(8, '0'));
// byte-level diff check between decoded payload and node bytes
env.run('__BYTES = {}', 'set');
for (let i = 0; i < bytes.length; i++) env.run('__BYTES[' + (i+1) + '] = ' + bytes[i], 'b');
env.run('__bad = -1; for i=1,#__payload do if __payload:byte(i) ~= __BYTES[i] then __bad = i break end end', 'chk2');
console.log('first byte diff at', evalLua('__bad'));
