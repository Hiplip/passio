/**
 * Branded key types.
 *
 * Every key in this module is an AES-GCM `CryptoKey`, so the type system alone
 * cannot tell the vault key apart from the key that wraps it. Mixing them is
 * silent and catastrophic: encrypting items under the stretched key produces
 * data that becomes permanently unreadable the moment the master password
 * changes. The brands make that mistake a compile error.
 *
 * A brand is a type-level marker only; it exists nowhere at runtime. Each key is
 * cast exactly once, where it is constructed.
 */

/** Encrypts and decrypts vault items. One per account, never rotated. */
export type VaultKey = CryptoKey & { readonly __brand: "VaultKey" };

/** Wraps and unwraps the vault key. Derived from the master password or from a
 *  recovery key; never used on item data. */
export type WrappingKey = CryptoKey & { readonly __brand: "WrappingKey" };
