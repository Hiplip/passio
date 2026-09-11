import { AAD_ITEM_PREFIX, AES_IV_BYTES, AES_TAG_BITS, CIPHER_VERSION } from "./constants";
import { bytesToUtf8, fromBase64Url, toBase64Url, utf8ToBytes } from "./encoding";
import type { VaultKey } from "./types";

/** The cipher string, or the authentic payload inside it, is not in a shape we
 *  recognise. Says nothing about authenticity: data that fails this way is
 *  malformed or corrupt, never evidence of a wrong key. */
export class CipherFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CipherFormatError";
  }
}

/** The auth tag did not verify: wrong key, wrong context, or altered
 *  ciphertext. This is the only error that may be read as "wrong password". */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

/**
 * The context string that binds an item ciphertext to the row holding it.
 *
 * One helper so the convention is fixed in a single place: a ciphertext moved
 * to another item's row, or replayed into a row it was deleted from, fails to
 * authenticate rather than decrypting into the wrong item.
 */
export function itemAad(itemId: string): string {
  if (itemId.length === 0) throw new Error("an item aad needs an item id");
  return `${AAD_ITEM_PREFIX}:${itemId}`;
}

/**
 * @param aad the context this ciphertext belongs to. Required, never defaulted:
 * a caller that cannot name the context does not know where the data belongs.
 */
export async function encryptBytes(
  plaintext: Uint8Array<ArrayBuffer>,
  key: CryptoKey,
  aad: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: AES_TAG_BITS, additionalData: utf8ToBytes(aad) },
    key,
    plaintext,
  );
  return `${CIPHER_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** @param aad must equal the value the ciphertext was encrypted under. */
export async function decryptBytes(
  cipher: string,
  key: CryptoKey,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const parts = cipher.split(".");
  if (parts.length !== 3) {
    throw new CipherFormatError(`expected 3 parts, received ${parts.length}`);
  }
  const [version, encodedIv, encodedPayload] = parts as [string, string, string];
  if (version !== CIPHER_VERSION) {
    throw new CipherFormatError(`unsupported cipher version: ${version}`);
  }

  let iv: Uint8Array<ArrayBuffer>;
  let payload: Uint8Array<ArrayBuffer>;
  try {
    iv = fromBase64Url(encodedIv);
    payload = fromBase64Url(encodedPayload);
  } catch {
    throw new CipherFormatError("cipher string is not valid base64url");
  }
  if (iv.length !== AES_IV_BYTES) {
    throw new CipherFormatError(`expected a ${AES_IV_BYTES} byte iv, received ${iv.length}`);
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: AES_TAG_BITS, additionalData: utf8ToBytes(aad) },
      key,
      payload,
    );
    return new Uint8Array(plaintext);
  } catch {
    // Deliberately opaque: never reveal which part failed.
    throw new DecryptionError("decryption failed");
  }
}

export async function encryptItem(
  value: unknown,
  key: VaultKey,
  aad: string,
): Promise<string> {
  const json = JSON.stringify(value);
  // `undefined`, a function and a symbol all stringify to `undefined`, which
  // would encrypt the four letters "undefined" and lose the item silently.
  if (typeof json !== "string") throw new TypeError("value cannot be serialised to json");
  return encryptBytes(utf8ToBytes(json), key, aad);
}

export async function decryptItem(
  cipher: string,
  key: VaultKey,
  aad: string,
): Promise<unknown> {
  const plaintext = await decryptBytes(cipher, key, aad);
  try {
    return JSON.parse(bytesToUtf8(plaintext));
  } catch {
    // The tag verified, so this is authentic data we cannot read: corruption,
    // not a wrong key. Reporting it as a DecryptionError would make the UI
    // blame the password.
    throw new CipherFormatError("decrypted payload is not valid json");
  }
}
