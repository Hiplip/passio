import { describe, expect, it } from "vitest";
import * as publicApi from "./index";

describe("the public crypto surface", () => {
  it("exports exactly the documented set and nothing more", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "CipherFormatError",
      "DecryptionError",
      "KDF_VERSION",
      "decryptItem",
      "deriveAuthHash",
      "deriveMasterKey",
      "deriveRecoveryAuthHash",
      "deriveRecoveryWrappingKey",
      "encryptItem",
      "generateRecoveryKey",
      "generateVaultKey",
      "normalizeEmail",
      "stretchMasterKey",
      "unwrapVaultKey",
      "wrapVaultKey",
    ]);
  });
});
