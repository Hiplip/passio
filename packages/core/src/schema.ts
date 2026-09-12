import { z } from "zod";

/**
 * The shape of a decrypted item.
 *
 * Validation happens AFTER decryption. The ciphertext is authenticated, so we
 * know the vault key wrote it - but the plaintext inside is still parsed JSON,
 * and an older or corrupted item could be any shape at all. Nothing in the UI
 * should trust it before it passes through here.
 *
 * The item type lives inside the encrypted blob, never in a database column, so
 * the server cannot tell a password from a credit card.
 */
const nonEmpty = z.string().trim().min(1, "required");

/**
 * Fields every item type shares.
 *
 * `folderId` lives inside the encrypted blob, not in a database column, so the
 * server cannot tell which items are grouped together - grouping is itself a
 * hint about what the items are.
 */
const commonFields = {
  title: nonEmpty,
  folderId: z.string().uuid().optional(),
};

export const loginItemSchema = z.object({
  type: z.literal("login"),
  ...commonFields,
  username: z.string().optional(),
  password: z.string().optional(),
  uri: z.string().optional(),
  notes: z.string().optional(),
  totp: z
    .object({
      /** Base32, as every authenticator app presents it. */
      secret: z.string().trim().min(1),
      digits: z.number().int().positive().optional(),
      period: z.number().int().positive().optional(),
      algorithm: z.string().optional(),
    })
    .optional(),
});

export const noteItemSchema = z.object({
  type: z.literal("note"),
  ...commonFields,
  body: z.string().optional(),
});

export const cardItemSchema = z.object({
  type: z.literal("card"),
  ...commonFields,
  cardholderName: z.string().optional(),
  // A string, never a number: a leading zero is significant and 16 digits
  // exceeds what a JS number represents exactly.
  number: z.string().optional(),
  brand: z.string().optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2000).max(2100).optional(),
  cvv: z.string().optional(),
  notes: z.string().optional(),
});

export const itemSchema = z.discriminatedUnion("type", [
  loginItemSchema,
  noteItemSchema,
  cardItemSchema,
]);

export type LoginItem = z.infer<typeof loginItemSchema>;
export type NoteItem = z.infer<typeof noteItemSchema>;
export type CardItem = z.infer<typeof cardItemSchema>;
export type Item = z.infer<typeof itemSchema>;
export type ItemType = Item["type"];

export function newLoginItem(): LoginItem {
  return { type: "login", title: "Untitled" };
}

export function newNoteItem(): NoteItem {
  return { type: "note", title: "Untitled note" };
}

export function newCardItem(): CardItem {
  return { type: "card", title: "Untitled card" };
}

/** The decrypted contents of a folder row. Its name is a secret like any other. */
export const folderSchema = z.object({
  name: nonEmpty,
});

export type Folder = z.infer<typeof folderSchema>;
