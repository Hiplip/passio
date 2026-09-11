import { AES_IV_BYTES, AES_TAG_BITS, CIPHER_VERSION } from "./constants";
import { bytesToUtf8, fromBase64Url, toBase64Url, utf8ToBytes } from "./encoding";

/** The cipher string is not in a shape we recognise. */
export class CipherFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CipherFormatError";
  }
}

/** The auth tag did not verify: wrong key, or the ciphertext was altered. */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

export async function encryptBytes(
  plaintext: Uint8Array<ArrayBuffer>,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: AES_TAG_BITS },
    key,
    plaintext,
  );
  return `${CIPHER_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptBytes(
  cipher: string,
  key: CryptoKey,
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
      { name: "AES-GCM", iv, tagLength: AES_TAG_BITS },
      key,
      payload,
    );
    return new Uint8Array(plaintext);
  } catch {
    // Deliberately opaque: never reveal which part failed.
    throw new DecryptionError("decryption failed");
  }
}

export async function encryptItem(value: unknown, key: CryptoKey): Promise<string> {
  return encryptBytes(utf8ToBytes(JSON.stringify(value)), key);
}

export async function decryptItem(cipher: string, key: CryptoKey): Promise<unknown> {
  const plaintext = await decryptBytes(cipher, key);
  try {
    return JSON.parse(bytesToUtf8(plaintext));
  } catch {
    throw new DecryptionError("decrypted payload is not valid json");
  }
}
