import { describe, expect, it, vi } from "vitest";

import {
  decryptItem, encryptItem, generateVaultKey, itemAad, wrapVaultKey,
} from "~/lib/crypto";
import { performDerivation } from "~/lib/crypto-worker/derive";

import { attemptUnlock } from "./unlock";

vi.mock("~/lib/crypto-worker/client", async () => {
  const { performDerivation: derive } = await import("~/lib/crypto-worker/derive");
  return { deriveInWorker: derive };
});

const EMAIL = "owner@example.com";
const AAD = itemAad("item-1");
const RIGHT = "the right master password";
const WRONG = "the wrong master password";

async function makeAccount(password: string) {
  const { stretchedKey } = await performDerivation(password, EMAIL);
  const vaultKey = await generateVaultKey();
  return {
    vaultKey,
    protectedVaultKey: await wrapVaultKey(vaultKey, stretchedKey, "master"),
  };
}

describe("attemptUnlock", () => {
  it("returns a vault key that decrypts existing items", async () => {
    const { vaultKey, protectedVaultKey } = await makeAccount(RIGHT);
    const cipher = await encryptItem({ type: "login", title: "GitHub" }, vaultKey, AAD);

    const result = await attemptUnlock(EMAIL, RIGHT, protectedVaultKey);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected unlock to succeed");
    expect(await decryptItem(cipher, result.vaultKey, AAD)).toEqual({
      type: "login",
      title: "GitHub",
    });
  });

  it("leaves the unwrapped key non-extractable", async () => {
    const { protectedVaultKey } = await makeAccount(RIGHT);

    const result = await attemptUnlock(EMAIL, RIGHT, protectedVaultKey);

    if (!result.ok) throw new Error("expected unlock to succeed");
    expect(result.vaultKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", result.vaultKey)).rejects.toThrow();
  });

  it("reports failure for the wrong password without throwing", async () => {
    const { protectedVaultKey } = await makeAccount(RIGHT);

    const result = await attemptUnlock(EMAIL, WRONG, protectedVaultKey);

    expect(result.ok).toBe(false);
  });

  it("reports failure for the wrong email, since the email is the salt", async () => {
    const { protectedVaultKey } = await makeAccount(RIGHT);

    const result = await attemptUnlock("other@example.com", RIGHT, protectedVaultKey);

    expect(result.ok).toBe(false);
  });

  it("normalizes the email, so casing and stray spaces still unlock", async () => {
    const { protectedVaultKey } = await makeAccount(RIGHT);

    const result = await attemptUnlock("  OWNER@Example.COM ", RIGHT, protectedVaultKey);

    expect(result.ok).toBe(true);
  });

  it("reports failure rather than throwing on a malformed stored key", async () => {
    const result = await attemptUnlock(EMAIL, RIGHT, "not-a-cipher-string");

    expect(result.ok).toBe(false);
  });

  it("reports failure on a tampered stored key", async () => {
    const { protectedVaultKey } = await makeAccount(RIGHT);
    const parts = protectedVaultKey.split(".");
    const payload = Buffer.from(parts[2]!, "base64url");
    payload[0] = (payload[0] ?? 0) ^ 0x01;
    const tampered = `${parts[0]}.${parts[1]}.${payload.toString("base64url")}`;

    const result = await attemptUnlock(EMAIL, RIGHT, tampered);

    expect(result.ok).toBe(false);
  });
});
