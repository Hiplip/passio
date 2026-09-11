import { describe, expect, it } from "vitest";
import { ARGON2_HASH_LEN } from "./constants";
import { deriveAuthHash, deriveMasterKey, stretchMasterKey } from "./kdf";

const PASSWORD = "correct horse battery staple";
const EMAIL = "owner@example.com";

describe("deriveMasterKey", () => {
  it("is deterministic for the same password and email", async () => {
    const a = await deriveMasterKey(PASSWORD, EMAIL);
    const b = await deriveMasterKey(PASSWORD, EMAIL);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("returns 32 bytes", async () => {
    expect(await deriveMasterKey(PASSWORD, EMAIL)).toHaveLength(32);
  });

  it("normalizes email case and surrounding whitespace", async () => {
    const a = await deriveMasterKey(PASSWORD, EMAIL);
    const b = await deriveMasterKey(PASSWORD, "  OWNER@Example.COM  ");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("differs when the password differs", async () => {
    const a = await deriveMasterKey(PASSWORD, EMAIL);
    const b = await deriveMasterKey(PASSWORD + "!", EMAIL);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("differs when the email differs — the email is the salt", async () => {
    const a = await deriveMasterKey(PASSWORD, EMAIL);
    const b = await deriveMasterKey(PASSWORD, "other@example.com");
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("accepts an email too short to be a valid Argon2 salt on its own", async () => {
    expect(await deriveMasterKey(PASSWORD, "a@b.co")).toHaveLength(32);
  });

  it("rejects an empty email", async () => {
    await expect(deriveMasterKey(PASSWORD, "   ")).rejects.toThrow(/email/i);
  });
});

describe("deriveAuthHash", () => {
  it("is deterministic", async () => {
    const masterKey = await deriveMasterKey(PASSWORD, EMAIL);
    expect(await deriveAuthHash(masterKey, PASSWORD))
      .toBe(await deriveAuthHash(masterKey, PASSWORD));
  });

  it("never equals the master key itself", async () => {
    const masterKey = await deriveMasterKey(PASSWORD, EMAIL);
    const authHash = await deriveAuthHash(masterKey, PASSWORD);
    expect(authHash).not.toBe(Buffer.from(masterKey).toString("base64url"));
  });

  it("fits inside Better Auth's 128 character password limit", async () => {
    const masterKey = await deriveMasterKey(PASSWORD, EMAIL);
    const authHash = await deriveAuthHash(masterKey, PASSWORD);
    expect(authHash.length).toBeGreaterThanOrEqual(8);
    expect(authHash.length).toBeLessThanOrEqual(128);
  });

  it("rejects a zero-length master key", async () => {
    await expect(deriveAuthHash(new Uint8Array(0), PASSWORD)).rejects.toThrow(/master key/i);
  });

  it("rejects a master key that is not the derived length", async () => {
    await expect(deriveAuthHash(new Uint8Array(ARGON2_HASH_LEN - 1), PASSWORD))
      .rejects.toThrow(/master key/i);
    await expect(deriveAuthHash(new Uint8Array(ARGON2_HASH_LEN + 1), PASSWORD))
      .rejects.toThrow(/master key/i);
  });
});

describe("stretchMasterKey", () => {
  it("returns a non-extractable AES-GCM key", async () => {
    const masterKey = await deriveMasterKey(PASSWORD, EMAIL);
    const key = await stretchMasterKey(masterKey);
    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("rejects a zero-length master key rather than deriving from nothing", async () => {
    await expect(stretchMasterKey(new Uint8Array(0))).rejects.toThrow(/master key/i);
  });

  it("rejects a master key that is not the derived length", async () => {
    await expect(stretchMasterKey(new Uint8Array(ARGON2_HASH_LEN - 1)))
      .rejects.toThrow(/master key/i);
    await expect(stretchMasterKey(new Uint8Array(ARGON2_HASH_LEN + 1)))
      .rejects.toThrow(/master key/i);
  });
});
