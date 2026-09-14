import {
  encryptItem,
  folderAad,
  itemAad,
  unwrapVaultKey,
  type VaultKey,
} from "@passio/crypto";
import type { WrappingKey } from "@passio/crypto/types";
import { copyActionsFor } from "@passio/core/actions";
import {
  decryptFolders,
  type EncryptedFolderRow,
} from "@passio/core/decrypt-folders";
import { decryptVault, type EncryptedRow } from "@passio/core/decrypt-vault";
import type { Item } from "@passio/core/schema";
import { matchItemsToUrl } from "@passio/core/match";

import type {
  FillField,
  FolderSummary,
  FullItem,
  ItemSummary,
  VaultState,
} from "./messages";

export interface CustodyApi {
  getKeys(): Promise<{ protectedVaultKey: string }>;
  listItems(): Promise<EncryptedRow[]>;
  listDeletedItems(): Promise<EncryptedRow[]>;
  createItem(id: string, ciphertext: string): Promise<void>;
  updateItem(id: string, ciphertext: string): Promise<void>;
  deleteItem(id: string): Promise<void>;
  restoreItem(id: string): Promise<void>;
  listFolders(): Promise<EncryptedFolderRow[]>;
  createFolder(id: string, ciphertext: string): Promise<void>;
  renameFolder(id: string, ciphertext: string): Promise<void>;
  deleteFolder(id: string): Promise<void>;
}

export interface CustodyDeps {
  derive(
    email: string,
    masterPassword: string,
  ): Promise<{ authHash: string; stretchedKey: WrappingKey }>;
  signIn(email: string, authHash: string): Promise<string>;
  readToken(): Promise<string | null>;
  writeToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  api(token: string): CustodyApi;
}

/**
 * The vault key's only home.
 *
 * This closure runs in the offscreen document and nowhere else. The key is a
 * non-extractable CryptoKey in a local variable: never serialised, never
 * written to storage, never sent in a message. Callers get item summaries with
 * no secrets in them, or one named field at a time.
 *
 * Every dependency is injected, so the whole state machine is testable with no
 * browser and no network - which matters more here than usual, because nothing
 * on the build machine can exercise the real thing.
 */
export function createCustody(deps: CustodyDeps) {
  let vaultKey: VaultKey | null = null;

  async function authorisedApi(email: string, authHash: string): Promise<CustodyApi> {
    const existing = await deps.readToken();

    if (existing) {
      const api = deps.api(existing);
      try {
        await api.getKeys();
        return api;
      } catch {
        // Stored tokens expire. We already hold this unlock's auth hash, so
        // sign in again rather than making anyone retype anything. Exactly one
        // retry: a second failure is a real error, not a stale token.
        await deps.clearToken();
      }
    }

    const token = await deps.signIn(email, authHash);
    await deps.writeToken(token);
    return deps.api(token);
  }

  /** Runs an API call with the stored token, or refuses if there is none. */
  async function withApi<T>(call: (api: CustodyApi) => Promise<T>): Promise<T> {
    const token = await deps.readToken();
    if (!token) throw new Error("The vault is locked.");
    return call(deps.api(token));
  }

  /** Decrypts the vault. Callers must already hold the key. */
  async function loadVault(key: VaultKey) {
    const rows = await withApi((api) => api.listItems());
    return decryptVault(rows, key);
  }

  /** Dates cross the message boundary as ISO strings; the reply is JSON. */
  function toFullItem(item: {
    id: string;
    data: Item;
    createdAt: Date;
    updatedAt: Date;
  }): FullItem {
    return {
      id: item.id,
      data: item.data,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  function requireKey(): VaultKey {
    if (!vaultKey) throw new Error("The vault is locked.");
    return vaultKey;
  }

  async function items(): Promise<{ items: ItemSummary[]; damaged: number }> {
    const { items: decrypted, damaged } = await loadVault(requireKey());
    return {
      damaged: damaged.length,
      items: decrypted.map(({ id, data }): ItemSummary => ({
        id,
        title: data.title,
        type: data.type,
        username: data.type === "login" ? data.username : undefined,
        uri: data.type === "login" ? data.uri : undefined,
        hasTotp: data.type === "login" && data.totp !== undefined,
        folderId: data.folderId,
      })),
    };
  }

  return {
    async status(): Promise<VaultState> {
      if (vaultKey) return "unlocked";
      return (await deps.readToken()) ? "locked" : "signed-out";
    },

    /** One Argon2id pass yields both the auth hash and the wrapping key. */
    async unlock(email: string, masterPassword: string): Promise<void> {
      const { authHash, stretchedKey } = await deps.derive(email, masterPassword);
      const api = await authorisedApi(email, authHash);
      const { protectedVaultKey } = await api.getKeys();

      // Throws on a wrong master password: the AES-GCM tag fails to verify.
      // The assignment happens only after that succeeds, so a failed unlock
      // leaves the vault locked rather than half-open.
      vaultKey = await unwrapVaultKey(protectedVaultKey, stretchedKey, "master");
    },

    /** Forgets the key. Deliberately keeps the session token: locking is not
     *  signing out, and clearing it would mean retyping the email every time
     *  the idle timer fires. */
    lock(): void {
      vaultKey = null;
    },

    async signOut(): Promise<void> {
      vaultKey = null;
      await deps.clearToken();
    },

    items,

    /** How many saved logins belong to a page. Returns 0 rather than throwing
     *  while locked: the badge must never become a lock-state oracle. */
    async matchCount(url: string): Promise<number> {
      if (!vaultKey) return 0;
      const { items: summaries } = await items();
      return matchItemsToUrl(summaries, url).length;
    },

    /**
     * The whole vault, decrypted.
     *
     * Unlike `items`, this carries plaintext - the editor cannot edit a
     * summary. The popup deliberately keeps using `items`, so the only context
     * that ever holds full plaintext is the editor page the user opened.
     */
    async itemsFull(): Promise<{ items: FullItem[]; damaged: string[] }> {
      const { items: decrypted, damaged } = await loadVault(requireKey());
      return { damaged, items: decrypted.map(toFullItem) };
    },

    async deletedItems(): Promise<{ items: FullItem[]; damaged: string[] }> {
      const key = requireKey();
      const rows = await withApi((api) => api.listDeletedItems());
      const { items: decrypted, damaged } = await decryptVault(rows, key);
      return { damaged, items: decrypted.map(toFullItem) };
    },

    async folders(): Promise<FolderSummary[]> {
      const key = requireKey();
      const rows = await withApi((api) => api.listFolders());
      return decryptFolders(rows, key);
    },

    /** Encryption happens HERE, never in the page: it needs the key. */
    async saveItem(id: string, item: Item, isNew: boolean): Promise<void> {
      const ciphertext = await encryptItem(item, requireKey(), itemAad(id));
      await withApi((api) =>
        isNew ? api.createItem(id, ciphertext) : api.updateItem(id, ciphertext),
      );
    },

    async removeItem(id: string): Promise<void> {
      requireKey();
      await withApi((api) => api.deleteItem(id));
    },

    async restoreItem(id: string): Promise<void> {
      requireKey();
      await withApi((api) => api.restoreItem(id));
    },

    async saveFolder(id: string, name: string, isNew: boolean): Promise<void> {
      const ciphertext = await encryptItem({ name }, requireKey(), folderAad(id));
      await withApi((api) =>
        isNew ? api.createFolder(id, ciphertext) : api.renameFolder(id, ciphertext),
      );
    },

    async removeFolder(id: string): Promise<void> {
      requireKey();
      await withApi((api) => api.deleteFolder(id));
    },

    /**
     * One field, decrypted on demand.
     *
     * Routed through copyActionsFor so a one-time code is generated at call
     * time rather than when the list was built. A code from the previous window
     * is worse than no code, because it looks like it worked.
     */
    async fieldValue(itemId: string, field: FillField): Promise<string> {
      const { items: decrypted } = await loadVault(requireKey());
      const found = decrypted.find((i) => i.id === itemId);
      if (!found) throw new Error("That item is no longer in the vault.");
      return copyActionsFor(found.data).find((a) => a.key === field)?.value ?? "";
    },
  };
}

export type Custody = ReturnType<typeof createCustody>;
