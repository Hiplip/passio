import { describe, expect, it } from "vitest";
import { DecryptionError } from "./cipher";
import {
  HKDF_INFO_RECOVERY, RECOVERY_PAYLOAD_CHARS, RECOVERY_PREFIX,
} from "./constants";
import { fromCrockfordBase32, toBase64Url, utf8ToBytes } from "./encoding";
import { RecoveryKeyError } from "./errors";
import { deriveMasterKey, stretchMasterKey } from "./kdf";
import { deriveRecoveryAuthHash, deriveRecoveryWrappingKey, generateRecoveryKey } from "./recovery";
import { generateVaultKey, unwrapVaultKey, wrapVaultKey } from "./vault-key";

/** The payload characters of a displayed key, without prefix or separators. */
function payloadOf(display: string): string {
  return display.toUpperCase().replace(/[\s-]/g, "").slice(RECOVERY_PREFIX.replace(/-/g, "").length);
}

/** Renders payload characters the way generateRecoveryKey would display them. */
function displayOf(payload: string): string {
  return [RECOVERY_PREFIX, ...(payload.match(/.{1,6}/g) ?? [])].join("-");
}

describe("generateRecoveryKey", () => {
  it("renders a prefixed, grouped, transcribable string", async () => {
    const { display } = await generateRecoveryKey();
    expect(display).toMatch(/^PASSIO-1(-[0-9A-HJKMNP-TV-Z]{6}){8}$/);
  });

  it("returns a different key each call", async () => {
    const a = await generateRecoveryKey();
    const b = await generateRecoveryKey();
    expect(a.display).not.toBe(b.display);
  });
});

describe("deriveRecoveryWrappingKey", () => {
  it("re-derives the same wrapping key from the displayed string", async () => {
    const { display, key } = await generateRecoveryKey();
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, key, "recovery");

    const rederived = await deriveRecoveryWrappingKey(display);
    const unwrapped = await unwrapVaultKey(wrapped, rederived, "recovery", true);

    expect(new Uint8Array(await crypto.subtle.exportKey("raw", unwrapped)))
      .toEqual(new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey)));
  });

  it("accepts the string lowercased and without separators", async () => {
    const { display, key } = await generateRecoveryKey();
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, key, "recovery");

    const messy = display.toLowerCase().replace(/-/g, " ");
    await expect(unwrapVaultKey(wrapped, await deriveRecoveryWrappingKey(messy), "recovery"))
      .resolves.toBeDefined();
  });

  it("accepts a bare payload typed without the prefix", async () => {
    const { display, key } = await generateRecoveryKey();
    const wrapped = await wrapVaultKey(await generateVaultKey(), key, "recovery");

    const bare = payloadOf(display);
    expect(bare).toHaveLength(RECOVERY_PAYLOAD_CHARS);
    await expect(unwrapVaultKey(wrapped, await deriveRecoveryWrappingKey(bare), "recovery"))
      .resolves.toBeDefined();
  });

  it("reads I and L as 1 and O as 0, the way Crockford transcription expects", async () => {
    const zeros = displayOf("0".repeat(RECOVERY_PAYLOAD_CHARS));
    const ones = displayOf("1".repeat(RECOVERY_PAYLOAD_CHARS));

    expect(await deriveRecoveryAuthHash(displayOf("O".repeat(RECOVERY_PAYLOAD_CHARS))))
      .toBe(await deriveRecoveryAuthHash(zeros));
    expect(await deriveRecoveryAuthHash(displayOf("I".repeat(RECOVERY_PAYLOAD_CHARS))))
      .toBe(await deriveRecoveryAuthHash(ones));
    expect(await deriveRecoveryAuthHash(displayOf("L".repeat(RECOVERY_PAYLOAD_CHARS))))
      .toBe(await deriveRecoveryAuthHash(ones));
  });

  it("unwraps a vault key from a hand-transcribed spelling of the same key", async () => {
    // Forced to contain both a 0 and a 1, so the substitution is never a no-op.
    const { display } = await generateRecoveryKey();
    const payload = `01${payloadOf(display).slice(2)}`;

    const key = await deriveRecoveryWrappingKey(displayOf(payload));
    const wrapped = await wrapVaultKey(await generateVaultKey(), key, "recovery");

    const transcribed = displayOf(payload.replace(/0/g, "O").replace(/1/g, "L"));
    await expect(
      unwrapVaultKey(wrapped, await deriveRecoveryWrappingKey(transcribed), "recovery"),
    ).resolves.toBeDefined();
  });

  it("rejects a string whose payload is the wrong length", async () => {
    await expect(deriveRecoveryWrappingKey("PASSIO-1-ABCDEF")).rejects.toThrow(RecoveryKeyError);
  });

  it("rejects a key with one extra character appended", async () => {
    const { display } = await generateRecoveryKey();
    await expect(deriveRecoveryWrappingKey(`${display}Z`)).rejects.toThrow(RecoveryKeyError);
  });

  it("derives nothing at all from a key with an extra character", async () => {
    // The bug this pins: trailing bits used to be discarded, so an appended
    // character produced the very same key.
    const { display } = await generateRecoveryKey();
    await expect(deriveRecoveryAuthHash(`${display}Z`)).rejects.toThrow(RecoveryKeyError);
  });

  it("rejects a string containing characters outside the alphabet", async () => {
    const { display } = await generateRecoveryKey();
    await expect(deriveRecoveryWrappingKey(display.replace(/.$/, "!")))
      .rejects.toThrow(RecoveryKeyError);
  });

  it("never names the offending character, which is key material", async () => {
    const { display } = await generateRecoveryKey();
    const mangled = `${display.slice(0, -1)}U`; // U is outside the alphabet

    const error: unknown = await deriveRecoveryWrappingKey(mangled).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RecoveryKeyError);
    expect((error as Error).message).not.toContain("U");
  });
});

describe("deriveRecoveryAuthHash", () => {
  it("is deterministic for the same recovery key", async () => {
    const { display } = await generateRecoveryKey();
    expect(await deriveRecoveryAuthHash(display)).toBe(await deriveRecoveryAuthHash(display));
  });

  it("differs between recovery keys", async () => {
    const a = await generateRecoveryKey();
    const b = await generateRecoveryKey();
    expect(await deriveRecoveryAuthHash(a.display)).not.toBe(await deriveRecoveryAuthHash(b.display));
  });

  it("tolerates the same formatting variations as the wrapping key", async () => {
    const { display } = await generateRecoveryKey();
    expect(await deriveRecoveryAuthHash(display.toLowerCase().replace(/-/g, " ")))
      .toBe(await deriveRecoveryAuthHash(display));
  });

  it("fits inside Better Auth's password length limits", async () => {
    const { display } = await generateRecoveryKey();
    const hash = await deriveRecoveryAuthHash(display);
    expect(hash.length).toBeGreaterThanOrEqual(8);
    expect(hash.length).toBeLessThanOrEqual(128);
  });

  it("is domain-separated from the wrapping derivation (deviation D5)", async () => {
    const { display } = await generateRecoveryKey();
    const bytes = fromCrockfordBase32(payloadOf(display));

    const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveBits"]);
    const sameBytesUnderWrappingInfo = toBase64Url(
      new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(0),
            info: utf8ToBytes(HKDF_INFO_RECOVERY),
          },
          material,
          256,
        ),
      ),
    );

    // The value handed to the server must never be derivable from the same
    // bytes under the wrapping-key info string.
    expect(await deriveRecoveryAuthHash(display)).not.toBe(sameBytesUnderWrappingInfo);
  });
});

describe("the two unlock paths are independent", () => {
  it("unwraps the same vault key from either the master password or the recovery key", async () => {
    const vaultKey = await generateVaultKey();
    const masterWrappingKey = await stretchMasterKey(
      await deriveMasterKey("master pw", "owner@example.com"),
    );
    const { display, key: recoveryWrappingKey } = await generateRecoveryKey();

    const protectedVaultKey = await wrapVaultKey(vaultKey, masterWrappingKey, "master");
    const recoveryWrapped = await wrapVaultKey(vaultKey, recoveryWrappingKey, "recovery");

    const viaMaster = await unwrapVaultKey(protectedVaultKey, masterWrappingKey, "master", true);
    const viaRecovery = await unwrapVaultKey(
      recoveryWrapped,
      await deriveRecoveryWrappingKey(display),
      "recovery",
      true,
    );

    const raw = async (k: CryptoKey) =>
      Array.from(new Uint8Array(await crypto.subtle.exportKey("raw", k)));
    expect(await raw(viaMaster)).toEqual(await raw(viaRecovery));
  });

  it("cannot unwrap the recovery copy using the master wrapping key", async () => {
    const vaultKey = await generateVaultKey();
    const masterWrappingKey = await stretchMasterKey(
      await deriveMasterKey("master pw", "owner@example.com"),
    );
    const { key: recoveryWrappingKey } = await generateRecoveryKey();

    await expect(
      unwrapVaultKey(
        await wrapVaultKey(vaultKey, recoveryWrappingKey, "recovery"),
        masterWrappingKey,
        "recovery",
      ),
    ).rejects.toThrow(DecryptionError);
  });
});
