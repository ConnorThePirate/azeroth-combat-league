/**
 * CRC-32 (IEEE 802.3, polynomial 0xEDB88320) over bytes, rendered as
 * eight lowercase hex digits — used as the envelope corruption check.
 * CRC is integrity of bytes only; it authenticates nothing.
 */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function crc32Hex(data: Uint8Array): string {
  return crc32(data).toString(16).padStart(8, "0");
}
