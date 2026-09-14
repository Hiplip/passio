"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DecryptedFolder } from "@passio/core/decrypt-folders";
import type { DecryptedItem } from "@passio/core/decrypt-vault";
import type { Item } from "@passio/core/schema";

export interface DecryptedList {
  items: DecryptedItem[];
  /**
   * Ids that would not decrypt or failed validation.
   *
   * Never silently dropped. An item the user believes they saved vanishing
   * without a word is the worst thing this product can do.
   */
  damaged: string[];
  isLoading: boolean;
}

/**
 * Everything the vault UI needs from a backend, with no backend in it.
 *
 * The web app implements this over tRPC with the vault key in React memory.
 * The extension implements it over messages to the offscreen document, which
 * is the only context that holds the key.
 *
 * Writes take PLAINTEXT. Encryption belongs to the adapter, because only the
 * adapter knows where the key lives - in the extension it is in another
 * context entirely, and no component should have to care.
 *
 * Ids are supplied by the caller, not generated here: an item's id is its
 * AES-GCM additional authenticated data, so it has to exist before the
 * plaintext can be sealed.
 */
export interface VaultDataValue {
  live: DecryptedList;
  deleted: DecryptedList;
  folders: DecryptedFolder[];
  foldersLoading: boolean;

  createItem: (id: string, item: Item) => Promise<void>;
  updateItem: (id: string, item: Item) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;

  createFolder: (id: string, name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

const VaultDataContext = createContext<VaultDataValue | null>(null);

export function VaultDataProvider({
  value,
  children,
}: {
  value: VaultDataValue;
  children: ReactNode;
}) {
  return (
    <VaultDataContext.Provider value={value}>{children}</VaultDataContext.Provider>
  );
}

export function useVaultData(): VaultDataValue {
  const context = useContext(VaultDataContext);
  if (!context) {
    throw new Error("useVaultData must be used inside a VaultDataProvider");
  }
  return context;
}
