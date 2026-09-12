import { describe, expect, it } from "vitest";

import { generateVaultKey, unwrapVaultKey, wrapVaultKey } from "..";

import { performDerivation } from "./derive";

const EMAIL = "owner@example.com";
const PASSWORD = "correct horse battery staple";

describe("performDerivation", () => {
  it("returns an auth hash and a usable stretched key in one pass", async () => {
    const { authHash, stretchedKey } = await performDerivation(PASSWORD, EMAIL);

    expect(typeof authHash).toBe("string");
    expect(authHash.length).toBeGreaterThanOrEqual(8);
    expect(authHash.length).toBeLessThanOrEqual(128);

    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, stretchedKey, "master");
    await expect(unwrapVaultKey(wrapped, stretchedKey, "master")).resolves.toBeDefined();
  });

  it("is deterministic for the same password and email", async () => {
    const a = await performDerivation(PASSWORD, EMAIL);
    const b = await performDerivation(PASSWORD, EMAIL);
    expect(a.authHash).toBe(b.authHash);
  });

  it("produces a different auth hash for a different password", async () => {
    const a = await performDerivation(PASSWORD, EMAIL);
    const b = await performDerivation(`${PASSWORD}!`, EMAIL);
    expect(a.authHash).not.toBe(b.authHash);
  });

  it("produces a stretched key that cannot be exported", async () => {
    const { stretchedKey } = await performDerivation(PASSWORD, EMAIL);
    expect(stretchedKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", stretchedKey)).rejects.toThrow();
  });

  it("yields keys that cannot unwrap each other across passwords", async () => {
    const right = await performDerivation(PASSWORD, EMAIL);
    const wrong = await performDerivation("a different password", EMAIL);
    const wrapped = await wrapVaultKey(await generateVaultKey(), right.stretchedKey, "master");

    await expect(unwrapVaultKey(wrapped, wrong.stretchedKey, "master")).rejects.toThrow();
  });

  it("propagates a rejected empty email", async () => {
    await expect(performDerivation(PASSWORD, "   ")).rejects.toThrow(/email/i);
  });
});
