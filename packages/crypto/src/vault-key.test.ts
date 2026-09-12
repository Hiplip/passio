import { describe, expect, it } from "vitest";
import { CipherFormatError, decryptItem, DecryptionError, encryptBytes, encryptItem, itemAad } from "./cipher";
import { AAD_VAULT_KEY_MASTER } from "./constants";
import { deriveMasterKey, stretchMasterKey } from "./kdf";
import { generateVaultKey, unwrapVaultKey, wrapVaultKey } from "./vault-key";

const EMAIL = "owner@example.com";
const AAD = itemAad("item-1");

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

    const cipher = await encryptItem({ type: "login", password: "hunter2" }, vaultKey, AAD);
    const wrapped = await wrapVaultKey(vaultKey, wrappingKey, "master");
    const unwrapped = await unwrapVaultKey(wrapped, wrappingKey, "master");

    expect(await decryptItem(cipher, unwrapped, AAD)).toEqual({ type: "login", password: "hunter2" });
  });

  it("fails to unwrap with a key derived from the wrong password", async () => {
    const vaultKey = await generateVaultKey();
    const right = await stretchMasterKey(await deriveMasterKey("right pw", EMAIL));
    const wrong = await stretchMasterKey(await deriveMasterKey("wrong pw", EMAIL));

    await expect(unwrapVaultKey(await wrapVaultKey(vaultKey, right, "master"), wrong, "master"))
      .rejects.toThrow(DecryptionError);
  });

  it("fails to unwrap with a key derived from a different email", async () => {
    const vaultKey = await generateVaultKey();
    const right = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const wrong = await stretchMasterKey(await deriveMasterKey("master pw", "other@example.com"));

    await expect(unwrapVaultKey(await wrapVaultKey(vaultKey, right, "master"), wrong, "master"))
      .rejects.toThrow(DecryptionError);
  });

  it("produces a different wrapping each time, because the iv is fresh", async () => {
    const wrappingKey = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const vaultKey = await generateVaultKey();
    expect(await wrapVaultKey(vaultKey, wrappingKey, "master"))
      .not.toBe(await wrapVaultKey(vaultKey, wrappingKey, "master"));
  });

  it("refuses to accept a master wrapping as a recovery wrapping", async () => {
    const wrappingKey = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const wrapped = await wrapVaultKey(await generateVaultKey(), wrappingKey, "master");

    await expect(unwrapVaultKey(wrapped, wrappingKey, "recovery")).rejects.toThrow(DecryptionError);
  });

  it("refuses to accept a recovery wrapping as a master wrapping", async () => {
    const wrappingKey = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const wrapped = await wrapVaultKey(await generateVaultKey(), wrappingKey, "recovery");

    await expect(unwrapVaultKey(wrapped, wrappingKey, "master")).rejects.toThrow(DecryptionError);
  });

  it("rejects an authentic wrapping whose payload is not a 32 byte key", async () => {
    const wrappingKey = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const forged = await encryptBytes(new Uint8Array(16), wrappingKey, AAD_VAULT_KEY_MASTER);

    await expect(unwrapVaultKey(forged, wrappingKey, "master")).rejects.toThrow(CipherFormatError);
  });
});

describe("unwrapped key extractability", () => {
  it("returns a non-extractable key by default, so XSS cannot export it", async () => {
    const wrappingKey = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const wrapped = await wrapVaultKey(await generateVaultKey(), wrappingKey, "master");

    const unwrapped = await unwrapVaultKey(wrapped, wrappingKey, "master");

    expect(unwrapped.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", unwrapped)).rejects.toThrow();
  });

  it("returns an extractable key only when the caller asks, for the re-wrap paths", async () => {
    const wrappingKey = await stretchMasterKey(await deriveMasterKey("master pw", EMAIL));
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, wrappingKey, "master");

    const unwrapped = await unwrapVaultKey(wrapped, wrappingKey, "master", true);

    expect(unwrapped.extractable).toBe(true);
    expect(new Uint8Array(await crypto.subtle.exportKey("raw", unwrapped)))
      .toEqual(new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey)));
  });
});
