import { decryptItem, folderAad, type VaultKey } from "@passio/crypto";

import { folderSchema } from "./schema";

export interface EncryptedFolderRow {
  id: string;
  ciphertext: string;
}

export interface DecryptedFolder {
  id: string;
  name: string;
}

/**
 * Decrypts the folder list, binding each row to its own id as AAD.
 *
 * A folder that fails to decrypt is skipped rather than thrown, for the same
 * reason a damaged item is: one bad row must never take the sidebar down. Its
 * items simply appear unfiled, which is recoverable, rather than invisible.
 */
export async function decryptFolders(
  rows: EncryptedFolderRow[],
  vaultKey: VaultKey,
): Promise<DecryptedFolder[]> {
  const folders: DecryptedFolder[] = [];

  for (const row of rows) {
    try {
      const parsed = folderSchema.safeParse(
        await decryptItem(row.ciphertext, vaultKey, folderAad(row.id)),
      );
      if (parsed.success) folders.push({ id: row.id, name: parsed.data.name });
    } catch {
      // Skipped on purpose: see the note above.
    }
  }

  return folders;
}
