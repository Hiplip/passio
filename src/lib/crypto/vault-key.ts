import { CipherFormatError, decryptBytes, encryptBytes } from "./cipher";
import {
  AAD_VAULT_KEY_MASTER, AAD_VAULT_KEY_RECOVERY, AES_KEY_BITS, VAULT_KEY_BYTES,
} from "./constants";
import type { VaultKey, WrappingKey } from "./types";

/**
 * Which of the two wrappings of the vault key this is.
 *
 * Both wrappings hold the identical 32 bytes, so nothing in the ciphertext
 * itself distinguishes them. The purpose becomes the AAD, which makes a
 * recovery-wrapped key fail to authenticate where a master-wrapped one is
 * expected, and the other way round.
 */
export type VaultKeyPurpose = "master" | "recovery";

const PURPOSE_AAD: Record<VaultKeyPurpose, string> = {
  master: AAD_VAULT_KEY_MASTER,
  recovery: AAD_VAULT_KEY_RECOVERY,
};

/** Generated once per account and never rotated. Items are encrypted with this,
 *  which is why changing the master password does not re-encrypt the vault. */
export async function generateVaultKey(): Promise<VaultKey> {
  return (await crypto.subtle.generateKey(
    { name: "AES-GCM", length: AES_KEY_BITS },
    true, // extractable, so it can be exported and wrapped
    ["encrypt", "decrypt"],
  )) as VaultKey;
}

export async function wrapVaultKey(
  vaultKey: VaultKey,
  wrappingKey: WrappingKey,
  purpose: VaultKeyPurpose,
): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey));
  try {
    return await encryptBytes(raw, wrappingKey, PURPOSE_AAD[purpose]);
  } finally {
    raw.fill(0);
  }
}

/**
 * @param extractable defaults to false: a plain unlock leaves a key that XSS
 * cannot export. Only the paths that re-wrap the key — signup and recovery —
 * need the raw bytes back, and they opt in explicitly.
 */
export async function unwrapVaultKey(
  wrapped: string,
  wrappingKey: WrappingKey,
  purpose: VaultKeyPurpose,
  extractable = false,
): Promise<VaultKey> {
  const raw = await decryptBytes(wrapped, wrappingKey, PURPOSE_AAD[purpose]);
  if (raw.length !== VAULT_KEY_BYTES) {
    // It authenticated, so the key was right and the stored bytes are wrong.
    throw new CipherFormatError("unwrapped vault key has an unexpected length");
  }
  try {
    return (await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: AES_KEY_BITS },
      extractable,
      ["encrypt", "decrypt"],
    )) as VaultKey;
  } finally {
    raw.fill(0);
  }
}
