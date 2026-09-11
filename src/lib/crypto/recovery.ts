import {
  AES_KEY_BITS, HKDF_INFO_RECOVERY, HKDF_INFO_RECOVERY_AUTH, RECOVERY_GROUP_SIZE,
  RECOVERY_KEY_BYTES, RECOVERY_PREFIX,
} from "./constants";
import { fromCrockfordBase32, toBase64Url, toCrockfordBase32, utf8ToBytes } from "./encoding";

/** Strips the prefix and any separators a person may have typed or omitted. */
function extractPayload(display: string): string {
  const upper = display.toUpperCase().replace(/[\s-]/g, "");
  const prefix = RECOVERY_PREFIX.replace(/-/g, "");
  return upper.startsWith(prefix) ? upper.slice(prefix.length) : upper;
}

function formatDisplay(payload: string): string {
  const groups = payload.match(new RegExp(`.{1,${RECOVERY_GROUP_SIZE}}`, "g")) ?? [];
  return [RECOVERY_PREFIX, ...groups].join("-");
}

/** Decodes the displayed string back to its raw bytes, rejecting anything malformed. */
function recoveryKeyBytes(display: string): Uint8Array<ArrayBuffer> {
  const bytes = fromCrockfordBase32(extractPayload(display));
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    throw new Error("invalid recovery key: unexpected length");
  }
  return bytes;
}

export async function deriveRecoveryWrappingKey(display: string): Promise<CryptoKey> {
  const bytes = recoveryKeyBytes(display);
  const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      // Domain-separated from the vault path so the two derivations can never collide.
      info: utf8ToBytes(HKDF_INFO_RECOVERY),
    },
    material,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Derives the value that proves possession of the recovery key to the server.
 *
 * Domain-separated from the wrapping key, so the server never holds anything
 * related to the key that actually unwraps the vault. The server hashes this
 * again before storing it. See deviation D5.
 */
export async function deriveRecoveryAuthHash(display: string): Promise<string> {
  const bytes = recoveryKeyBytes(display);
  const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: utf8ToBytes(HKDF_INFO_RECOVERY_AUTH),
    },
    material,
    256,
  );
  return toBase64Url(new Uint8Array(derived));
}

/** Shown to the user exactly once, at signup. Never stored in plaintext. */
export async function generateRecoveryKey(): Promise<{ display: string; key: CryptoKey }> {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_KEY_BYTES));
  const display = formatDisplay(toCrockfordBase32(bytes));
  return { display, key: await deriveRecoveryWrappingKey(display) };
}
