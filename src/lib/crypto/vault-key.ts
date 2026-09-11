import { decryptBytes, DecryptionError, encryptBytes } from "./cipher";
import { AES_KEY_BITS, VAULT_KEY_BYTES } from "./constants";

/** Generated once per account and never rotated. Items are encrypted with this,
 *  which is why changing the master password does not re-encrypt the vault. */
export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: AES_KEY_BITS },
    true, // extractable, so it can be exported and wrapped
    ["encrypt", "decrypt"],
  );
}

export async function wrapVaultKey(
  vaultKey: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey));
  return encryptBytes(raw, wrappingKey);
}

export async function unwrapVaultKey(
  wrapped: string,
  wrappingKey: CryptoKey,
): Promise<CryptoKey> {
  const raw = await decryptBytes(wrapped, wrappingKey);
  if (raw.length !== VAULT_KEY_BYTES) {
    throw new DecryptionError("unwrapped vault key has an unexpected length");
  }
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: AES_KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}
