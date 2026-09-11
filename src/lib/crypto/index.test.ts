import { describe, expect, it } from "vitest";
import * as publicApi from "./index";

describe("the public crypto surface", () => {
  it("exports exactly the documented set and nothing more", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "CipherFormatError",
      "DecryptionError",
      "KDF_VERSION",
      "RecoveryKeyError",
      "decryptItem",
      "deriveRecoveryAuthHash",
      "deriveRecoveryWrappingKey",
      "encryptItem",
      "generateRecoveryKey",
      "generateVaultKey",
      "itemAad",
      "normalizeEmail",
      "unwrapVaultKey",
      "wrapVaultKey",
    ]);
  });
});
