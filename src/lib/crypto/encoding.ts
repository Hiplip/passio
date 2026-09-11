const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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
    const index = CROCKFORD.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 character: ${char}`);
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
