export {
  CipherFormatError, DecryptionError, decryptItem, encryptItem, folderAad, itemAad,
} from "./cipher";
export { KDF_VERSION } from "./constants";
export { RecoveryKeyError } from "./errors";
// deriveMasterKey, deriveAuthHash and stretchMasterKey are deliberately absent:
// raw master-key material never leaves the worker, so only crypto-worker/derive
// imports them, directly from "./kdf".
export { normalizeEmail } from "./kdf";
export {
  deriveRecoveryAuthHash, deriveRecoveryWrappingKey, generateRecoveryKey,
} from "./recovery";
export type { VaultKey, WrappingKey } from "./types";
export type { VaultKeyPurpose } from "./vault-key";
export { generateVaultKey, unwrapVaultKey, wrapVaultKey } from "./vault-key";
