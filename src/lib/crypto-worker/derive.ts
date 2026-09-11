// Imported from the module directly, not the public barrel: these three touch
// raw master-key material, which never leaves this worker.
import { deriveAuthHash, deriveMasterKey, stretchMasterKey } from "~/lib/crypto/kdf";
import type { WrappingKey } from "~/lib/crypto/types";

export interface DerivationResult {
  /** Sent to Better Auth in place of a password. */
  authHash: string;
  /** Non-extractable AES-GCM key that wraps and unwraps the vault key. */
  stretchedKey: WrappingKey;
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
    // Best-effort only: this clears one copy of several. hash-wasm keeps its own
    // material in the wasm heap, and the browser may have copied the buffer
    // during the derivations above. It costs nothing and shortens the window.
    masterKey.fill(0);
  }
}
