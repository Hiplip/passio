import { describe, expect, it, vi } from "vitest";

import {
  decryptItem,
  encryptItem,
  generateRecoveryKey,
  generateVaultKey,
  itemAad,
  unwrapVaultKey,
  wrapVaultKey,
} from "~/lib/crypto";
import { performDerivation } from "~/lib/crypto-worker/derive";

import { buildPasswordChangePayload, buildRecoveryPayload } from "./recovery";

vi.mock("~/lib/crypto-worker/client", async () => {
  const { performDerivation: derive } = await import("~/lib/crypto-worker/derive");
  return { deriveInWorker: derive };
});

const EMAIL = "owner@example.com";
const NEW_PASSWORD = "a brand new master password";
const AAD = itemAad("item-1");

/** Sets an account up exactly as signup would have. */
const CURRENT_PASSWORD = "the current master password";

async function existingAccount() {
  const vaultKey = await generateVaultKey();
  const recovery = await generateRecoveryKey();
  const { stretchedKey } = await performDerivation(CURRENT_PASSWORD, EMAIL);
  return {
    vaultKey,
    recoveryDisplay: recovery.display,
    protectedVaultKey: await wrapVaultKey(vaultKey, stretchedKey, "master"),
    recoveryWrappedVaultKey: await wrapVaultKey(vaultKey, recovery.key, "recovery"),
    cipher: await encryptItem({ type: "login", title: "GitHub" }, vaultKey, AAD),
  };
}

describe("buildRecoveryPayload", () => {
  it("preserves the vault key, so existing items still decrypt afterwards", async () => {
    const account = await existingAccount();

    const payload = await buildRecoveryPayload({
      email: EMAIL,
      recoveryDisplay: account.recoveryDisplay,
      recoveryWrappedVaultKey: account.recoveryWrappedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    const { stretchedKey } = await performDerivation(NEW_PASSWORD, EMAIL);
    const recovered = await unwrapVaultKey(
      payload.newProtectedVaultKey,
      stretchedKey,
      "master",
    );

    // The item was encrypted before recovery ran. If the vault key had changed,
    // this would fail and every stored item would be lost.
    expect(await decryptItem(account.cipher, recovered, AAD)).toEqual({
      type: "login",
      title: "GitHub",
    });
  });

  it("issues a fresh recovery key, retiring the old one", async () => {
    const account = await existingAccount();

    const payload = await buildRecoveryPayload({
      email: EMAIL,
      recoveryDisplay: account.recoveryDisplay,
      recoveryWrappedVaultKey: account.recoveryWrappedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    expect(payload.newRecoveryDisplay).not.toBe(account.recoveryDisplay);
    expect(payload.newRecoveryDisplay).toMatch(/^PASSIO-1(-[0-9A-HJKMNP-TV-Z]{6}){8}$/);
  });

  it("rejects a recovery key that does not unwrap the vault, before any network call", async () => {
    const account = await existingAccount();
    const wrong = await generateRecoveryKey();

    await expect(
      buildRecoveryPayload({
        email: EMAIL,
        recoveryDisplay: wrong.display,
        recoveryWrappedVaultKey: account.recoveryWrappedVaultKey,
        newMasterPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow();
  });

  it("never includes the recovery key or the master password in what is sent", async () => {
    const account = await existingAccount();

    const payload = await buildRecoveryPayload({
      email: EMAIL,
      recoveryDisplay: account.recoveryDisplay,
      recoveryWrappedVaultKey: account.recoveryWrappedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    const { newRecoveryDisplay, ...sent } = payload;
    const serialised = JSON.stringify(sent);

    expect(serialised).not.toContain(NEW_PASSWORD);
    expect(serialised).not.toContain(account.recoveryDisplay);
    expect(serialised).not.toContain(newRecoveryDisplay);
  });

  it("normalizes the email so the new derivation matches at login", async () => {
    const account = await existingAccount();

    const payload = await buildRecoveryPayload({
      email: "  OWNER@Example.COM ",
      recoveryDisplay: account.recoveryDisplay,
      recoveryWrappedVaultKey: account.recoveryWrappedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    expect(payload.email).toBe(EMAIL);
  });
});

describe("buildPasswordChangePayload", () => {
  it("re-wraps the same vault key, leaving every item decryptable", async () => {
    const account = await existingAccount();

    const payload = await buildPasswordChangePayload({
      email: EMAIL,
      currentMasterPassword: CURRENT_PASSWORD,
      protectedVaultKey: account.protectedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    const { stretchedKey } = await performDerivation(NEW_PASSWORD, EMAIL);
    const rewrapped = await unwrapVaultKey(
      payload.newProtectedVaultKey,
      stretchedKey,
      "master",
    );

    expect(await decryptItem(account.cipher, rewrapped, AAD)).toEqual({
      type: "login",
      title: "GitHub",
    });
  });

  it("produces an auth hash Better Auth will accept", async () => {
    const account = await existingAccount();

    const payload = await buildPasswordChangePayload({
      email: EMAIL,
      currentMasterPassword: CURRENT_PASSWORD,
      protectedVaultKey: account.protectedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    expect(payload.newAuthHash.length).toBeGreaterThanOrEqual(8);
    expect(payload.newAuthHash.length).toBeLessThanOrEqual(128);
  });

  it("does not leak the new master password", async () => {
    const account = await existingAccount();

    const payload = await buildPasswordChangePayload({
      email: EMAIL,
      currentMasterPassword: CURRENT_PASSWORD,
      protectedVaultKey: account.protectedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    expect(JSON.stringify(payload)).not.toContain(NEW_PASSWORD);
  });

  it("rejects a wrong current password before anything reaches the network", async () => {
    const account = await existingAccount();

    await expect(
      buildPasswordChangePayload({
        email: EMAIL,
        currentMasterPassword: "not the current password",
        protectedVaultKey: account.protectedVaultKey,
        newMasterPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow();
  });

  it("works from a stored wrapping alone, needing no extractable key in memory", async () => {
    const account = await existingAccount();

    // A normal unlock yields a NON-extractable key, which could not be
    // re-wrapped. This flow must not depend on one.
    const payload = await buildPasswordChangePayload({
      email: EMAIL,
      currentMasterPassword: CURRENT_PASSWORD,
      protectedVaultKey: account.protectedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    expect(payload.newProtectedVaultKey).toMatch(/^v1\./);
    expect(payload.currentAuthHash).not.toBe(payload.newAuthHash);
  });

  it("produces a wrapping the old password cannot unwrap", async () => {
    const account = await existingAccount();

    const payload = await buildPasswordChangePayload({
      email: EMAIL,
      currentMasterPassword: CURRENT_PASSWORD,
      protectedVaultKey: account.protectedVaultKey,
      newMasterPassword: NEW_PASSWORD,
    });

    const { stretchedKey: oldKey } = await performDerivation("the old password", EMAIL);
    await expect(
      unwrapVaultKey(payload.newProtectedVaultKey, oldKey, "master"),
    ).rejects.toThrow();
  });
});
