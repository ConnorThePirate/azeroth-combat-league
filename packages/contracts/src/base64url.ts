/** base64url without padding — printable inside WoW addon messages/edit boxes. */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64urlEncode(data: Uint8Array): string {
  let out = "";
  const n = data.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = data[i]!;
    const b1 = i + 1 < n ? data[i + 1]! : 0;
    const b2 = i + 2 < n ? data[i + 2]! : 0;
    out += B64[b0 >> 2]! + B64[((b0 & 3) << 4) | (b1 >> 4)]!;
    if (i + 1 < n) out += B64[((b1 & 15) << 2) | (b2 >> 6)]!;
    if (i + 2 < n) out += B64[b2 & 63]!;
  }
  return out;
}

export function base64urlDecode(s: string): Uint8Array {
  const rev = new Map<string, number>();
  for (let i = 0; i < B64.length; i++) rev.set(B64[i]!, i);
  const cleanLen = s.length;
  const bytes: number[] = [];
  for (let i = 0; i < cleanLen; i += 4) {
    const c0 = rev.get(s[i]!);
    const c1 = i + 1 < cleanLen ? rev.get(s[i + 1]!) : undefined;
    const c2 = i + 2 < cleanLen ? rev.get(s[i + 2]!) : undefined;
    const c3 = i + 3 < cleanLen ? rev.get(s[i + 3]!) : undefined;
    if (c0 === undefined || c1 === undefined) {
      throw new Error("invalid base64url character");
    }
    const x = (c0 << 18) | (c1 << 12) | ((c2 ?? 0) << 6) | (c3 ?? 0);
    bytes.push((x >> 16) & 0xff);
    if (c2 !== undefined) bytes.push((x >> 8) & 0xff);
    if (c3 !== undefined) bytes.push(x & 0xff);
  }
  return new Uint8Array(bytes);
}
