/** Bump when any KDF parameter below changes, so existing accounts stay
 *  migratable. Persisted as `user.kdf_version`; it never appears in a ciphertext. */
export const KDF_VERSION = 1;

export const ARGON2_MEMORY_KIB = 65_536; // 64 MiB
export const ARGON2_ITERATIONS = 3;
export const ARGON2_PARALLELISM = 4;
export const ARGON2_HASH_LEN = 32;

/** Argon2 requires a salt of at least 8 bytes. A short email such as "a@b.co" is
 *  only 6, so the email is hashed to a fixed 32 bytes rather than used directly. */
export const SALT_DOMAIN = "passio-salt-v1";

export const AUTH_HASH_ITERATIONS = 1;
export const AUTH_HASH_LEN = 32;

export const HKDF_INFO_VAULT = "passio-vault-key-v1";
export const HKDF_INFO_RECOVERY = "passio-recovery-key-v1";
/** Separate again, so the value proving possession to the server can never
 *  equal the key that unwraps the vault. See deviation D5. */
export const HKDF_INFO_RECOVERY_AUTH = "passio-recovery-auth-v1";

export const AES_IV_BYTES = 12;
export const AES_TAG_BITS = 128;
export const AES_KEY_BITS = 256;
export const VAULT_KEY_BYTES = 32;

export const CIPHER_VERSION = "v1";

/** Every ciphertext is bound to the slot it belongs in, as AES-GCM additional
 *  authenticated data. Without it any ciphertext decrypts in any slot, so a
 *  malicious server could swap or roll back rows undetectably. */
export const AAD_ITEM_PREFIX = "passio-item-v1";
/** The two vault-key wrappings hold identical plaintext, so only the AAD keeps a
 *  recovery-wrapped key from being accepted where a master-wrapped one belongs. */
export const AAD_VAULT_KEY_MASTER = "passio-vault-key-v1:master";
export const AAD_VAULT_KEY_RECOVERY = "passio-vault-key-v1:recovery";

/** 30 bytes → exactly 48 base32 characters → 8 groups of 6. 240 bits of entropy. */
export const RECOVERY_KEY_BYTES = 30;
export const RECOVERY_GROUP_SIZE = 6;
export const RECOVERY_PREFIX = "PASSIO-1";
/** ceil(30 * 8 / 5). Checked before decoding, so a key with characters appended
 *  is rejected rather than silently decoding to the same bytes. */
export const RECOVERY_PAYLOAD_CHARS = Math.ceil((RECOVERY_KEY_BYTES * 8) / 5);
