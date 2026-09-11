import { normalizeEmail, unwrapVaultKey } from "~/lib/crypto";
import { deriveInWorker } from "~/lib/crypto-worker/client";

export type UnlockResult =
  | { ok: true; vaultKey: CryptoKey }
  | { ok: false };

/**
 * Unlocks the vault entirely in the browser.
 *
 * A wrong master password is detected by the AES-GCM auth tag failing to
 * verify, so there is no server round-trip and no oracle an attacker could
 * query. The server never learns whether an unlock attempt succeeded.
 *
 * Returns a result rather than throwing: a wrong password is an expected
 * outcome of normal use, not an exceptional one. Every failure looks identical
 * to the caller, so the UI cannot accidentally tell a wrong password apart from
 * a corrupt stored key.
 */
export async function attemptUnlock(
  email: string,
  masterPassword: string,
  protectedVaultKey: string,
): Promise<UnlockResult> {
  const { stretchedKey } = await deriveInWorker(
    masterPassword,
    normalizeEmail(email),
  );

  try {
    return { ok: true, vaultKey: await unwrapVaultKey(protectedVaultKey, stretchedKey) };
  } catch {
    return { ok: false };
  }
}
