import { decryptItem, itemAad, type VaultKey } from "~/lib/crypto";

import { type Item, itemSchema } from "./schema";

export interface EncryptedRow {
  id: string;
  ciphertext: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedItem {
  id: string;
  data: Item;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedVault {
  items: DecryptedItem[];
  /**
   * Ids that could not be decrypted or failed validation.
   *
   * Never discarded: the ciphertext stays in the database and may well be
   * recoverable. Silently dropping a row the user believes they saved is the
   * worst thing a password manager can do.
   */
  damaged: string[];
}

/**
 * Decrypts the whole vault in one pass, per item.
 *
 * Each row is decrypted with its own id as additional authenticated data, so a
 * ciphertext moved into a different row fails to authenticate and is reported
 * as damaged rather than silently accepted.
 *
 * One bad row must never take down the vault, so failures are collected instead
 * of thrown.
 */
export async function decryptVault(
  rows: EncryptedRow[],
  vaultKey: VaultKey,
): Promise<DecryptedVault> {
  const items: DecryptedItem[] = [];
  const damaged: string[] = [];

  for (const row of rows) {
    try {
      const plaintext = await decryptItem(row.ciphertext, vaultKey, itemAad(row.id));
      const parsed = itemSchema.safeParse(plaintext);

      if (!parsed.success) {
        damaged.push(row.id);
        continue;
      }

      items.push({
        id: row.id,
        data: parsed.data,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    } catch {
      damaged.push(row.id);
    }
  }

  return { items, damaged };
}
