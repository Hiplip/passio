import {
  deriveRecoveryAuthHash,
  deriveRecoveryWrappingKey,
  generateRecoveryKey,
  normalizeEmail,
  unwrapVaultKey,
  wrapVaultKey,
} from "@passio/crypto";
import { deriveInWorker } from "@passio/crypto/worker/client";

export interface RecoveryInput {
  email: string;
  recoveryDisplay: string;
  recoveryWrappedVaultKey: string;
  newMasterPassword: string;
}

export interface RecoveryPayload {
  email: string;
  recoveryAuthHash: string;
  newAuthHash: string;
  newProtectedVaultKey: string;
  newRecoveryWrappedVaultKey: string;
  newRecoveryVerifier: string;
  /** Shown to the user. NEVER sent - strip before the mutation call. */
  newRecoveryDisplay: string;
}

/**
 * Redeems a recovery key and rotates every credential around the vault key.
 *
 * The vault key itself is deliberately unchanged: it is unwrapped with the old
 * recovery key and re-wrapped under both the new master password and a new
 * recovery key. That is why no item has to be re-encrypted, and why items saved
 * before recovery are still readable after it.
 *
 * Unwrapping happens first and throws on a wrong key, so an incorrect recovery
 * key fails locally before anything reaches the network.
 */
export async function buildRecoveryPayload(
  input: RecoveryInput,
): Promise<RecoveryPayload> {
  const email = normalizeEmail(input.email);

  const oldWrappingKey = await deriveRecoveryWrappingKey(input.recoveryDisplay);
  // Extractable: this key must be re-wrapped twice below.
  const vaultKey = await unwrapVaultKey(
    input.recoveryWrappedVaultKey,
    oldWrappingKey,
    "recovery",
    true,
  );

  const { authHash, stretchedKey } = await deriveInWorker(
    input.newMasterPassword,
    email,
  );
  const nextRecovery = await generateRecoveryKey();

  return {
    email,
    recoveryAuthHash: await deriveRecoveryAuthHash(input.recoveryDisplay),
    newAuthHash: authHash,
    newProtectedVaultKey: await wrapVaultKey(vaultKey, stretchedKey, "master"),
    newRecoveryWrappedVaultKey: await wrapVaultKey(
      vaultKey,
      nextRecovery.key,
      "recovery",
    ),
    newRecoveryVerifier: await deriveRecoveryAuthHash(nextRecovery.display),
    newRecoveryDisplay: nextRecovery.display,
  };
}

export interface PasswordChangeInput {
  email: string;
  currentMasterPassword: string;
  /** The stored wrapping, as returned by vault.getKeys. */
  protectedVaultKey: string;
  newMasterPassword: string;
}

export interface PasswordChangePayload {
  /** Proves the caller knows the current password, so a stolen session cookie
   *  is not enough to take the account over. */
  currentAuthHash: string;
  newAuthHash: string;
  newProtectedVaultKey: string;
}

/**
 * Changes the master password by re-wrapping 32 bytes.
 *
 * Items are encrypted with the vault key, not with anything derived from the
 * password, so none of them are touched.
 *
 * This deliberately takes the current password and unwraps the vault key itself
 * rather than accepting the one held in memory. The in-memory key from a normal
 * unlock is non-extractable, so it could not be re-wrapped - passing it would
 * fail only at runtime, and only for the person changing their password. Doing
 * the unwrap here, with `extractable: true`, makes that mistake unrepresentable.
 */
export async function buildPasswordChangePayload(
  input: PasswordChangeInput,
): Promise<PasswordChangePayload> {
  const email = normalizeEmail(input.email);

  const current = await deriveInWorker(input.currentMasterPassword, email);
  // Throws on a wrong current password, before anything reaches the network.
  const vaultKey = await unwrapVaultKey(
    input.protectedVaultKey,
    current.stretchedKey,
    "master",
    true,
  );

  const next = await deriveInWorker(input.newMasterPassword, email);

  return {
    currentAuthHash: current.authHash,
    newAuthHash: next.authHash,
    newProtectedVaultKey: await wrapVaultKey(vaultKey, next.stretchedKey, "master"),
  };
}
