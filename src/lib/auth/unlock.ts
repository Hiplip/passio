import { normalizeEmail, unwrapVaultKey, type VaultKey } from "@passio/crypto";
import { deriveInWorker } from "@passio/crypto/worker/client";

export type UnlockResult =
  | { ok: true; vaultKey: VaultKey }
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
    // Left non-extractable: unlocking never needs the raw bytes back, so an
    // XSS payload that reaches the key still cannot export it.
    return {
      ok: true,
      vaultKey: await unwrapVaultKey(protectedVaultKey, stretchedKey, "master"),
    };
  } catch {
    return { ok: false };
  }
}
