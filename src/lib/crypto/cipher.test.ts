import { beforeAll, describe, expect, it } from "vitest";
import { CipherFormatError, DecryptionError, decryptItem, encryptItem } from "./cipher";

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt", "decrypt",
  ]);
}

/** The format is fixed at three parts, so a tuple assertion keeps the tampering
 *  helpers readable under noUncheckedIndexedAccess. */
function split(cipher: string): [string, string, string] {
  return cipher.split(".") as [string, string, string];
}

let key: CryptoKey;
let otherKey: CryptoKey;
beforeAll(async () => {
  key = await makeKey();
  otherKey = await makeKey();
});

describe("encryptItem / decryptItem", () => {
  it("round-trips a structured item", async () => {
    const item = { type: "login", title: "GitHub", password: "hunter2", notes: "line\nline" };
    expect(await decryptItem(await encryptItem(item, key), key)).toEqual(item);
  });

  it("round-trips multi-byte text", async () => {
    const item = { type: "note", title: "密码", body: "🔐 pässwörd" };
    expect(await decryptItem(await encryptItem(item, key), key)).toEqual(item);
  });

  it("emits the versioned three-part format", async () => {
    const cipher = await encryptItem({ a: 1 }, key);
    const parts = cipher.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("v1");
  });

  it("never reuses an IV for identical plaintext", async () => {
    const item = { type: "note", title: "same", body: "same" };
    const first = await encryptItem(item, key);
    const second = await encryptItem(item, key);
    expect(first).not.toBe(second);
    expect(first.split(".")[1]).not.toBe(second.split(".")[1]);
  });

  it("does not leak plaintext into the ciphertext", async () => {
    const cipher = await encryptItem({ type: "login", password: "hunter2" }, key);
    expect(cipher).not.toContain("hunter2");
    expect(cipher).not.toContain("login");
  });
});

describe("tamper resistance", () => {
  it("throws when a ciphertext byte is flipped", async () => {
    const [version, iv, payload] = split(await encryptItem({ a: 1 }, key));
    const bytes = Buffer.from(payload, "base64url");
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const tampered = `${version}.${iv}.${bytes.toString("base64url")}`;
    await expect(decryptItem(tampered, key)).rejects.toThrow(DecryptionError);
  });

  it("throws when the IV is altered", async () => {
    const [version, iv, payload] = split(await encryptItem({ a: 1 }, key));
    const bytes = Buffer.from(iv, "base64url");
    bytes[0] = (bytes[0] ?? 0) ^ 0x01;
    const tampered = `${version}.${bytes.toString("base64url")}.${payload}`;
    await expect(decryptItem(tampered, key)).rejects.toThrow(DecryptionError);
  });

  it("throws when decrypting with the wrong key", async () => {
    await expect(decryptItem(await encryptItem({ a: 1 }, key), otherKey))
      .rejects.toThrow(DecryptionError);
  });
});

describe("format validation", () => {
  it("rejects an unknown version prefix rather than guessing", async () => {
    const cipher = await encryptItem({ a: 1 }, key);
    const forged = `v2.${cipher.split(".").slice(1).join(".")}`;
    await expect(decryptItem(forged, key)).rejects.toThrow(CipherFormatError);
  });

  it("rejects a string with the wrong number of parts", async () => {
    await expect(decryptItem("v1.onlytwo", key)).rejects.toThrow(CipherFormatError);
  });

  it("rejects an empty string", async () => {
    await expect(decryptItem("", key)).rejects.toThrow(CipherFormatError);
  });
});
