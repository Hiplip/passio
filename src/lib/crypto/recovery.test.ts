import { describe, expect, it } from "vitest";
import { DecryptionError } from "./cipher";
import { deriveMasterKey, stretchMasterKey } from "./kdf";
import { deriveRecoveryAuthHash, deriveRecoveryWrappingKey, generateRecoveryKey } from "./recovery";
import { generateVaultKey, unwrapVaultKey, wrapVaultKey } from "./vault-key";

describe("generateRecoveryKey", () => {
  it("renders a prefixed, grouped, transcribable string", async () => {
    const { display } = await generateRecoveryKey();
    expect(display).toMatch(/^PASSIO-1(-[0-9A-HJKMNP-TV-Z]{6}){8}$/);
  });

  it("returns a different key each call", async () => {
    const a = await generateRecoveryKey();
    const b = await generateRecoveryKey();
    expect(a.display).not.toBe(b.display);
  });
});

describe("deriveRecoveryWrappingKey", () => {
  it("re-derives the same wrapping key from the displayed string", async () => {
    const { display, key } = await generateRecoveryKey();
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, key);

    const rederived = await deriveRecoveryWrappingKey(display);
    const unwrapped = await unwrapVaultKey(wrapped, rederived);

    expect(new Uint8Array(await crypto.subtle.exportKey("raw", unwrapped)))
      .toEqual(new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey)));
  });

  it("accepts the string lowercased and without separators", async () => {
    const { display, key } = await generateRecoveryKey();
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, key);

    const messy = display.toLowerCase().replace(/-/g, " ");
    await expect(unwrapVaultKey(wrapped, await deriveRecoveryWrappingKey(messy)))
      .resolves.toBeDefined();
  });

  it("rejects a string whose payload is the wrong length", async () => {
    await expect(deriveRecoveryWrappingKey("PASSIO-1-ABCDEF")).rejects.toThrow(/recovery key/i);
  });

  it("rejects a string containing characters outside the alphabet", async () => {
    const { display } = await generateRecoveryKey();
    await expect(deriveRecoveryWrappingKey(display.replace(/.$/, "!"))).rejects.toThrow();
  });
});

describe("deriveRecoveryAuthHash", () => {
  it("is deterministic for the same recovery key", async () => {
    const { display } = await generateRecoveryKey();
    expect(await deriveRecoveryAuthHash(display)).toBe(await deriveRecoveryAuthHash(display));
  });

  it("differs between recovery keys", async () => {
    const a = await generateRecoveryKey();
    const b = await generateRecoveryKey();
    expect(await deriveRecoveryAuthHash(a.display)).not.toBe(await deriveRecoveryAuthHash(b.display));
  });

  it("tolerates the same formatting variations as the wrapping key", async () => {
    const { display } = await generateRecoveryKey();
    expect(await deriveRecoveryAuthHash(display.toLowerCase().replace(/-/g, " ")))
      .toBe(await deriveRecoveryAuthHash(display));
  });

  it("fits inside Better Auth's password length limits", async () => {
    const { display } = await generateRecoveryKey();
    const hash = await deriveRecoveryAuthHash(display);
    expect(hash.length).toBeGreaterThanOrEqual(8);
    expect(hash.length).toBeLessThanOrEqual(128);
  });
});

describe("the two unlock paths are independent", () => {
  it("unwraps the same vault key from either the master password or the recovery key", async () => {
    const vaultKey = await generateVaultKey();
    const masterWrappingKey = await stretchMasterKey(
      await deriveMasterKey("master pw", "owner@example.com"),
    );
    const { display, key: recoveryWrappingKey } = await generateRecoveryKey();

    const protectedVaultKey = await wrapVaultKey(vaultKey, masterWrappingKey);
    const recoveryWrapped = await wrapVaultKey(vaultKey, recoveryWrappingKey);

    const viaMaster = await unwrapVaultKey(protectedVaultKey, masterWrappingKey);
    const viaRecovery = await unwrapVaultKey(
      recoveryWrapped,
      await deriveRecoveryWrappingKey(display),
    );

    const raw = async (k: CryptoKey) =>
      Array.from(new Uint8Array(await crypto.subtle.exportKey("raw", k)));
    expect(await raw(viaMaster)).toEqual(await raw(viaRecovery));
  });

  it("cannot unwrap the recovery copy using the master wrapping key", async () => {
    const vaultKey = await generateVaultKey();
    const masterWrappingKey = await stretchMasterKey(
      await deriveMasterKey("master pw", "owner@example.com"),
    );
    const { key: recoveryWrappingKey } = await generateRecoveryKey();

    await expect(
      unwrapVaultKey(await wrapVaultKey(vaultKey, recoveryWrappingKey), masterWrappingKey),
    ).rejects.toThrow(DecryptionError);
  });
});
