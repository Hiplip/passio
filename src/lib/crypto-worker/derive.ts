import { deriveAuthHash, deriveMasterKey, stretchMasterKey } from "~/lib/crypto";

export interface DerivationResult {
  /** Sent to Better Auth in place of a password. */
  authHash: string;
  /** Non-extractable AES-GCM key that wraps and unwraps the vault key. */
  stretchedKey: CryptoKey;
}

/**
 * The only expensive operation in the app: Argon2id at 64 MiB, roughly a second.
 *
 * Both outputs come from a single derivation pass, so unlocking costs one
 * Argon2 run rather than two.
 */
export async function performDerivation(
  masterPassword: string,
  email: string,
): Promise<DerivationResult> {
  const masterKey = await deriveMasterKey(masterPassword, email);
  try {
    return {
      authHash: await deriveAuthHash(masterKey, masterPassword),
      stretchedKey: await stretchMasterKey(masterKey),
    };
  } finally {
    // Do not leave the master key sitting in memory after derivation.
    masterKey.fill(0);
  }
}
