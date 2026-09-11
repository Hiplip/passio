import { RecoveryKeyError } from "./errors";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Crockford's decoder reads I and L as 1, and O as 0, so a key read off paper
 *  survives the letters people habitually confuse. U stays invalid: Crockford
 *  excludes it from the alphabet and gives it no alias. */
const CROCKFORD_ALIASES: Record<string, string> = { I: "1", L: "1", O: "0" };

/** Returns bytes backed by a plain (non-shared) ArrayBuffer, which is what
 *  WebCrypto's BufferSource parameters require. */
export function utf8ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.length % 4 === 0 ? base64 : base64 + "=".repeat(4 - (base64.length % 4));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// In both loops only the low 12 bits of `accumulator` are ever significant: at
// most 4 (encode) or 7 (decode) left over, plus the 8 or 5 just shifted in. Every
// read masks down to those, so the stale high bits that `<<` drags along — and
// eventually shifts past 32 — can never corrupt a result, at any input length.
export function toCrockfordBase32(bytes: Uint8Array): string {
  let bits = 0;
  let accumulator = 0;
  let out = "";
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      // charAt, not [], so the result is `string` under noUncheckedIndexedAccess.
      out += CROCKFORD.charAt((accumulator >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD.charAt((accumulator << (5 - bits)) & 31);
  return out;
}

export function fromCrockfordBase32(value: string): Uint8Array<ArrayBuffer> {
  let bits = 0;
  let accumulator = 0;
  const out: number[] = [];
  for (const char of value.toUpperCase()) {
    const index = CROCKFORD.indexOf(CROCKFORD_ALIASES[char] ?? char);
    // The character itself is never named: the input is a recovery key.
    if (index === -1) throw new RecoveryKeyError("recovery key contains an invalid character");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
