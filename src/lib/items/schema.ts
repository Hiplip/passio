import { z } from "zod";

/**
 * The shape of a decrypted item.
 *
 * Validation happens AFTER decryption. The ciphertext is authenticated, so we
 * know it was written by someone holding the vault key - but the plaintext
 * inside is still parsed JSON, and an older or corrupted item could be any
 * shape at all. Nothing in the UI should trust it before it passes through
 * here.
 *
 * Phases 5 adds `note` and `card` to this union. The discriminated union is set
 * up now so that is an addition rather than a rewrite.
 */
const nonEmpty = z.string().trim().min(1, "required");

export const loginItemSchema = z.object({
  type: z.literal("login"),
  title: nonEmpty,
  username: z.string().optional(),
  password: z.string().optional(),
  uri: z.string().optional(),
  notes: z.string().optional(),
  // Phase 3 adds `totp` here.
});

export const itemSchema = z.discriminatedUnion("type", [loginItemSchema]);

export type LoginItem = z.infer<typeof loginItemSchema>;
export type Item = z.infer<typeof itemSchema>;

export function newLoginItem(): LoginItem {
  return { type: "login", title: "Untitled" };
}
