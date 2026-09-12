import { beforeAll, describe, expect, it } from "vitest";
import {
  CipherFormatError, DecryptionError, decryptItem, encryptBytes, encryptItem, itemAad,
} from "./cipher";
import { AES_IV_BYTES } from "./constants";
import { toBase64Url, utf8ToBytes } from "./encoding";
import type { VaultKey } from "./types";
import { generateVaultKey } from "./vault-key";

/** The format is fixed at three parts, so a tuple assertion keeps the tampering
 *  helpers readable under noUncheckedIndexedAccess. */
function split(cipher: string): [string, string, string] {
  return cipher.split(".") as [string, string, string];
}

/** True when `needle` appears anywhere inside `haystack` as a byte run. */
function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

const AAD_A = itemAad("item-a");
const AAD_B = itemAad("item-b");

let key: VaultKey;
let otherKey: VaultKey;
beforeAll(async () => {
  key = await generateVaultKey();
  otherKey = await generateVaultKey();
});

describe("encryptItem / decryptItem", () => {
  it("round-trips a structured item", async () => {
    const item = { type: "login", title: "GitHub", password: "hunter2", notes: "line\nline" };
    expect(await decryptItem(await encryptItem(item, key, AAD_A), key, AAD_A)).toEqual(item);
  });

  it("round-trips multi-byte text", async () => {
    const item = { type: "note", title: "密码", body: "🔐 pässwörd" };
    expect(await decryptItem(await encryptItem(item, key, AAD_A), key, AAD_A)).toEqual(item);
  });

  it("emits the versioned three-part format", async () => {
    const cipher = await encryptItem({ a: 1 }, key, AAD_A);
    const parts = cipher.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("v1");
  });

  it("never reuses an IV for identical plaintext", async () => {
    const item = { type: "note", title: "same", body: "same" };
    const first = await encryptItem(item, key, AAD_A);
    const second = await encryptItem(item, key, AAD_A);
    expect(first).not.toBe(second);
    expect(first.split(".")[1]).not.toBe(second.split(".")[1]);
  });

  it("does not leak plaintext into the ciphertext bytes", async () => {
    const item = { type: "login", password: "hunter2" };
    const [, , payload] = split(await encryptItem(item, key, AAD_A));
    const bytes = new Uint8Array(Buffer.from(payload, "base64url"));

    // The decoded payload, not the base64 text: base64 of a short word rarely
    // contains that word, so asserting on the encoded string proves nothing.
    expect(containsBytes(bytes, utf8ToBytes("hunter2"))).toBe(false);
    expect(containsBytes(bytes, utf8ToBytes(JSON.stringify(item)))).toBe(false);
  });

  it("rejects a value JSON.stringify cannot represent", async () => {
    await expect(encryptItem(undefined, key, AAD_A)).rejects.toThrow(TypeError);
    await expect(encryptItem(() => 1, key, AAD_A)).rejects.toThrow(TypeError);
  });
});

describe("additional authenticated data", () => {
  it("refuses a ciphertext presented under a different aad", async () => {
    const cipher = await encryptItem({ secret: 1 }, key, AAD_A);
    await expect(decryptItem(cipher, key, AAD_B)).rejects.toThrow(DecryptionError);
  });

  it("refuses one item's ciphertext moved into another item's slot", async () => {
    const itemB = await encryptItem({ type: "login", title: "B" }, key, itemAad("b"));
    await expect(decryptItem(itemB, key, itemAad("a"))).rejects.toThrow(DecryptionError);
  });

  it("accepts the ciphertext under its own aad", async () => {
    const cipher = await encryptItem({ secret: 1 }, key, AAD_B);
    expect(await decryptItem(cipher, key, AAD_B)).toEqual({ secret: 1 });
  });

  it("derives a distinct aad per item id", () => {
    expect(itemAad("a")).not.toBe(itemAad("b"));
    expect(itemAad("item-42").endsWith("item-42")).toBe(true);
  });

  it("refuses to build an aad from an empty item id", () => {
    expect(() => itemAad("")).toThrow();
  });
});

describe("tamper resistance", () => {
  it("throws when a ciphertext byte is flipped", async () => {
    const [version, iv, payload] = split(await encryptItem({ a: 1 }, key, AAD_A));
    const bytes = Buffer.from(payload, "base64url");
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const tampered = `${version}.${iv}.${bytes.toString("base64url")}`;
    await expect(decryptItem(tampered, key, AAD_A)).rejects.toThrow(DecryptionError);
  });

  it("throws when the IV is altered", async () => {
    const [version, iv, payload] = split(await encryptItem({ a: 1 }, key, AAD_A));
    const bytes = Buffer.from(iv, "base64url");
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const tampered = `${version}.${bytes.toString("base64url")}.${payload}`;
    await expect(decryptItem(tampered, key, AAD_A)).rejects.toThrow(DecryptionError);
  });

  it("throws when decrypting with the wrong key", async () => {
    await expect(decryptItem(await encryptItem({ a: 1 }, key, AAD_A), otherKey, AAD_A))
      .rejects.toThrow(DecryptionError);
  });
});

describe("format validation", () => {
  it("rejects an unknown version prefix rather than guessing", async () => {
    const cipher = await encryptItem({ a: 1 }, key, AAD_A);
    const forged = `v2.${cipher.split(".").slice(1).join(".")}`;
    await expect(decryptItem(forged, key, AAD_A)).rejects.toThrow(CipherFormatError);
  });

  it("rejects a string with the wrong number of parts", async () => {
    await expect(decryptItem("v1.onlytwo", key, AAD_A)).rejects.toThrow(CipherFormatError);
  });

  it("rejects an empty string", async () => {
    await expect(decryptItem("", key, AAD_A)).rejects.toThrow(CipherFormatError);
  });

  it("rejects an IV of the wrong length", async () => {
    const [version, , payload] = split(await encryptItem({ a: 1 }, key, AAD_A));
    const shortIv = toBase64Url(new Uint8Array(AES_IV_BYTES - 1));
    await expect(decryptItem(`${version}.${shortIv}.${payload}`, key, AAD_A))
      .rejects.toThrow(CipherFormatError);
  });

  it("rejects a payload that is not valid base64url", async () => {
    const [version, iv] = split(await encryptItem({ a: 1 }, key, AAD_A));
    await expect(decryptItem(`${version}.${iv}.not!valid!base64`, key, AAD_A))
      .rejects.toThrow(CipherFormatError);
  });

  it("reports an authentic payload that is not json as a format error, not a decryption error",
    async () => {
      const cipher = await encryptBytes(utf8ToBytes("this is not json"), key, AAD_A);
      await expect(decryptItem(cipher, key, AAD_A)).rejects.toThrow(CipherFormatError);
      await expect(decryptItem(cipher, key, AAD_A)).rejects.not.toThrow(DecryptionError);
    });
});
