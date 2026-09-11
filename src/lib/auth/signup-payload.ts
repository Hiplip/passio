import {
  deriveRecoveryAuthHash,
  generateRecoveryKey,
  generateVaultKey,
  normalizeEmail,
  wrapVaultKey,
} from "~/lib/crypto";
import { deriveInWorker } from "~/lib/crypto-worker/client";

export interface SignupPayload {
  email: string;
  /** The auth hash. Never the master password. */
  password: string;
  protectedVaultKey: string;
  recoveryWrappedVaultKey: string;
  /** Proves possession of the recovery key during recovery. */
  recoveryVerifier: string;
  /** Shown to the user exactly once. NEVER sent to the server. */
  recoveryDisplay: string;
}

/**
 * Builds everything signup needs, entirely in the browser.
 *
 * One vault key is generated and wrapped twice: once under the master password
 * and once under a fresh recovery key. Because items are encrypted with the
 * vault key rather than anything derived from the password, either wrapping
 * recovers the whole vault, and changing the password later re-wraps 32 bytes
 * instead of re-encrypting everything.
 *
 * `recoveryDisplay` is the one field the caller must strip before the request.
 */
export async function buildSignupPayload(
  email: string,
  masterPassword: string,
): Promise<SignupPayload> {
  const normalized = normalizeEmail(email);

  const { authHash, stretchedKey } = await deriveInWorker(masterPassword, normalized);
  const vaultKey = await generateVaultKey();
  const recovery = await generateRecoveryKey();

  return {
    email: normalized,
    password: authHash,
    protectedVaultKey: await wrapVaultKey(vaultKey, stretchedKey),
    recoveryWrappedVaultKey: await wrapVaultKey(vaultKey, recovery.key),
    recoveryVerifier: await deriveRecoveryAuthHash(recovery.display),
    recoveryDisplay: recovery.display,
  };
}
