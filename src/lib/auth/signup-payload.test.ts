import { describe, expect, it, vi } from "vitest";

import { unwrapVaultKey, deriveRecoveryWrappingKey } from "~/lib/crypto";
import { performDerivation } from "~/lib/crypto-worker/derive";

import { buildSignupPayload } from "./signup-payload";

// A Web Worker cannot be constructed under the test environment, so the worker
// client resolves to the same pure function the worker itself calls.
vi.mock("~/lib/crypto-worker/client", async () => {
  const { performDerivation: derive } = await import("~/lib/crypto-worker/derive");
  return { deriveInWorker: derive };
});

const EMAIL = "owner@example.com";
const PASSWORD = "a genuinely long master password";

describe("buildSignupPayload", () => {
  it("never carries the master password in anything sent to the server", async () => {
    const payload = await buildSignupPayload(EMAIL, PASSWORD);
    const { recoveryDisplay: _recoveryDisplay, ...sent } = payload;

    expect(JSON.stringify(sent)).not.toContain(PASSWORD);
    expect(payload.password).not.toContain(PASSWORD);
  });

  it("never sends the recovery key itself, only a derived verifier", async () => {
    const payload = await buildSignupPayload(EMAIL, PASSWORD);
    const { recoveryDisplay, ...sent } = payload;

    expect(JSON.stringify(sent)).not.toContain(recoveryDisplay);
    expect(payload.recoveryVerifier).not.toBe(recoveryDisplay);
  });

  it("produces a printable, grouped recovery key", async () => {
    const { recoveryDisplay } = await buildSignupPayload(EMAIL, PASSWORD);
    expect(recoveryDisplay).toMatch(/^PASSIO-1(-[0-9A-HJKMNP-TV-Z]{6}){8}$/);
  });

  it("wraps one vault key under both the master password and the recovery key", async () => {
    const payload = await buildSignupPayload(EMAIL, PASSWORD);

    const { stretchedKey } = await performDerivation(PASSWORD, EMAIL);
    const viaMaster = await unwrapVaultKey(payload.protectedVaultKey, stretchedKey);
    const viaRecovery = await unwrapVaultKey(
      payload.recoveryWrappedVaultKey,
      await deriveRecoveryWrappingKey(payload.recoveryDisplay),
    );

    const raw = async (k: CryptoKey) =>
      Array.from(new Uint8Array(await crypto.subtle.exportKey("raw", k)));

    // Both paths must recover the SAME vault key, or recovery would strand
    // every item ever encrypted.
    expect(await raw(viaMaster)).toEqual(await raw(viaRecovery));
  });

  it("emits two distinct wrappings, never the same ciphertext twice", async () => {
    const payload = await buildSignupPayload(EMAIL, PASSWORD);
    expect(payload.protectedVaultKey).not.toBe(payload.recoveryWrappedVaultKey);
    expect(payload.protectedVaultKey).toMatch(/^v1\./);
    expect(payload.recoveryWrappedVaultKey).toMatch(/^v1\./);
  });

  it("produces an auth hash Better Auth will accept", async () => {
    const { password } = await buildSignupPayload(EMAIL, PASSWORD);
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(password.length).toBeLessThanOrEqual(128);
  });

  it("gives a different vault key and recovery key to every account", async () => {
    const a = await buildSignupPayload(EMAIL, PASSWORD);
    const b = await buildSignupPayload(EMAIL, PASSWORD);

    expect(a.recoveryDisplay).not.toBe(b.recoveryDisplay);
    expect(a.protectedVaultKey).not.toBe(b.protectedVaultKey);
  });

  it("normalizes the email so the derivation matches at login", async () => {
    const payload = await buildSignupPayload("  OWNER@Example.COM ", PASSWORD);
    expect(payload.email).toBe(EMAIL);

    const { stretchedKey } = await performDerivation(PASSWORD, EMAIL);
    await expect(
      unwrapVaultKey(payload.protectedVaultKey, stretchedKey),
    ).resolves.toBeDefined();
  });
});
