import { argon2id, createSHA256, pbkdf2 } from "hash-wasm";
import {
  AES_KEY_BITS, ARGON2_HASH_LEN, ARGON2_ITERATIONS, ARGON2_MEMORY_KIB, ARGON2_PARALLELISM,
  AUTH_HASH_ITERATIONS, AUTH_HASH_LEN, HKDF_INFO_VAULT, SALT_DOMAIN,
} from "./constants";
import { toBase64Url, utf8ToBytes } from "./encoding";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Argon2 needs >= 8 salt bytes; hashing the email guarantees a fixed 32. */
async function emailSalt(normalizedEmail: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    utf8ToBytes(`${SALT_DOMAIN}:${normalizedEmail}`),
  );
  return new Uint8Array(digest);
}

export async function deriveMasterKey(
  masterPassword: string,
  email: string,
): Promise<Uint8Array> {
  const normalized = normalizeEmail(email);
  if (normalized.length === 0) throw new Error("email is required for key derivation");

  return argon2id({
    password: utf8ToBytes(masterPassword),
    salt: await emailSalt(normalized),
    iterations: ARGON2_ITERATIONS,
    parallelism: ARGON2_PARALLELISM,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: ARGON2_HASH_LEN,
    outputType: "binary",
  });
}

/** The value sent to Better Auth in place of a password. */
export async function deriveAuthHash(
  masterKey: Uint8Array,
  masterPassword: string,
): Promise<string> {
  const bytes = await pbkdf2({
    password: masterKey,
    salt: utf8ToBytes(masterPassword),
    iterations: AUTH_HASH_ITERATIONS,
    hashLength: AUTH_HASH_LEN,
    hashFunction: createSHA256(),
    outputType: "binary",
  });
  return toBase64Url(bytes);
}

/** Expands the master key into the AES-GCM key that wraps the vault key. */
export async function stretchMasterKey(masterKey: Uint8Array): Promise<CryptoKey> {
  // Copied into a plain (non-shared) ArrayBuffer: hash-wasm hands back a Uint8Array
  // whose buffer type is wider than WebCrypto's BufferSource accepts.
  const material = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(masterKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: utf8ToBytes(HKDF_INFO_VAULT),
    },
    material,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false, // non-extractable: this key must never leave the worker
    ["encrypt", "decrypt"],
  );
}
