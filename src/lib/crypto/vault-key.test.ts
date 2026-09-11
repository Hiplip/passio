import { describe, expect, it } from "vitest";
import { decryptItem, DecryptionError, encryptItem } from "./cipher";
import { deriveMasterKey, stretchMasterKey } from "./kdf";
import { generateVaultKey, unwrapVaultKey, wrapVaultKey } from "./vault-key";

const EMAIL = "owner@example.com";

describe("generateVaultKey", () => {
  it("returns an extractable 256-bit AES-GCM key", async () => {
    const key = await generateVaultKey();
    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.extractable).toBe(true); // must be exportable in order to be wrapped
    expect(new Uint8Array(await crypto.subtle.exportKey("raw", key))).toHaveLength(32);
  });

  it("returns a different key each call", async () => {
    const a = await crypto.subtle.exportKey("raw", await generateVaultKey());
    const b = await crypto.subtle.exportKey("raw", await generateVaultKey());
    expect(Array.from(new Uint8Array(a))).not.toEqual(Array.from(new Uint8Array(b)));
  });
});

describe("wrap and unwrap", () => {
  it("unwraps to a key that decrypts what the original encrypted", async () => {
    const masterKey = await deriveMasterKey("master pw", EMAIL);
    const wrappingKey = await stretchMasterKey(masterKey);
    const vaultKey = await generateVaultKey();

    const cipher = await encryptItem({ type: "login", password: "hunter2" }, vaultKey);
    const unwrapped = await unwrapVaultKey(await wrapVaultKey(vaultKey, wrappingKey), wrappingKey);

    expect(await decryptItem(cipher, unwrapped)).toEqual({ type: "login", password: "hunter2" });
  });

  it("fails to unwrap with a key derived from the wrong password", async () => {
    const vaultKey = await generateVaultKey();
    const right = await stretchMasterKey(await deriveMasterKey("right pw", EMAIL));
    const wrong = await stretchMasterKey(await deriveMasterKey("wrong pw", EMAIL));

    await expect(unwrapVaultKey(await wrapVaultKey(vaultKey, right), wrong))
      .rejects.toThrow(DecryptionError);
  });

  it("fails to unwrap with a key derived from a different email", async () => {
    const vaultKey = await generateVaultKey();
    const right = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const wrong = await stretchMasterKey(await deriveMasterKey("master pw", "other@example.com"));

    await expect(unwrapVaultKey(await wrapVaultKey(vaultKey, right), wrong))
      .rejects.toThrow(DecryptionError);
  });

  it("produces a different wrapping each time, because the iv is fresh", async () => {
    const wrappingKey = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const vaultKey = await generateVaultKey();
    expect(await wrapVaultKey(vaultKey, wrappingKey))
      .not.toBe(await wrapVaultKey(vaultKey, wrappingKey));
  });
});
