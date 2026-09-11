import { describe, expect, it } from "vitest";
import {
  bytesToUtf8, fromBase64Url, fromCrockfordBase32,
  toBase64Url, toCrockfordBase32, utf8ToBytes,
} from "./encoding";

describe("utf8", () => {
  it("round-trips including multi-byte characters", () => {
    const s = "pässwörd 🔐 密码";
    expect(bytesToUtf8(utf8ToBytes(s))).toBe(s);
  });
});

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 64, 7]);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("emits no padding and no URL-unsafe characters", () => {
    const bytes = new Uint8Array([251, 255, 190, 255, 255]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
  });

  it("round-trips every input length from 0 to 32 bytes", () => {
    for (let n = 0; n <= 32; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37) % 256);
      expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
    }
  });
});

describe("crockford base32", () => {
  it("round-trips 30 bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(30));
    expect(Array.from(fromCrockfordBase32(toCrockfordBase32(bytes)))).toEqual(Array.from(bytes));
  });

  it("produces 48 characters for 30 bytes", () => {
    expect(toCrockfordBase32(new Uint8Array(30))).toHaveLength(48);
  });

  it("excludes the ambiguous letters I, L, O and U", () => {
    const encoded = toCrockfordBase32(crypto.getRandomValues(new Uint8Array(256)));
    expect(encoded).not.toMatch(/[ILOU]/);
  });

  it("decodes case-insensitively", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(30));
    const encoded = toCrockfordBase32(bytes);
    expect(Array.from(fromCrockfordBase32(encoded.toLowerCase()))).toEqual(Array.from(bytes));
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => fromCrockfordBase32("ABC!DEF")).toThrow();
  });
});
