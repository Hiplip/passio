import {
  AES_KEY_BITS, HKDF_INFO_RECOVERY, HKDF_INFO_RECOVERY_AUTH, RECOVERY_GROUP_SIZE,
  RECOVERY_KEY_BYTES, RECOVERY_PAYLOAD_CHARS, RECOVERY_PREFIX,
} from "./constants";
import { fromCrockfordBase32, toBase64Url, toCrockfordBase32, utf8ToBytes } from "./encoding";
import { RecoveryKeyError } from "./errors";
import type { WrappingKey } from "./types";

const PREFIX_COMPACT = RECOVERY_PREFIX.replace(/-/g, "");
/** Hoisted: formatDisplay would otherwise compile a fresh RegExp per call. */
const GROUP_PATTERN = new RegExp(`.{1,${RECOVERY_GROUP_SIZE}}`, "g");

/**
 * Strips the prefix and any separators a person may have typed or omitted.
 *
 * Prefix detection is by LENGTH, not by `startsWith`. The decoder aliases I and
 * L to 1 and O to 0, so every letter of "PASSIO1" now decodes as base32 and a
 * bare payload could legitimately begin with those characters. Only the total
 * length tells the two apart, and anything else is rejected rather than guessed.
 */
function extractPayload(display: string): string {
  const upper = display.toUpperCase().replace(/[\s-]/g, "");

  if (
    upper.length === PREFIX_COMPACT.length + RECOVERY_PAYLOAD_CHARS &&
    upper.startsWith(PREFIX_COMPACT)
  ) {
    return upper.slice(PREFIX_COMPACT.length);
  }
  if (upper.length === RECOVERY_PAYLOAD_CHARS) return upper;

  throw new RecoveryKeyError("invalid recovery key: unexpected length");
}

function formatDisplay(payload: string): string {
  return [RECOVERY_PREFIX, ...(payload.match(GROUP_PATTERN) ?? [])].join("-");
}

/** Decodes the displayed string back to its raw bytes, rejecting anything malformed. */
function recoveryKeyBytes(display: string): Uint8Array<ArrayBuffer> {
  // extractPayload has already fixed the character count, so trailing bits can
  // no longer be discarded unnoticed; this length check is belt and braces.
  const bytes = fromCrockfordBase32(extractPayload(display));
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    throw new RecoveryKeyError("invalid recovery key: unexpected length");
  }
  return bytes;
}

export async function deriveRecoveryWrappingKey(display: string): Promise<WrappingKey> {
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
  ) as Promise<WrappingKey>;
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
export async function generateRecoveryKey(): Promise<{ display: string; key: WrappingKey }> {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_KEY_BYTES));
  const display = formatDisplay(toCrockfordBase32(bytes));
  return { display, key: await deriveRecoveryWrappingKey(display) };
}
