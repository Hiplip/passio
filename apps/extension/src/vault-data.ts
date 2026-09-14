import type { DecryptedItem } from "@passio/core/decrypt-vault";
import type { Item } from "@passio/core/schema";
import type { VaultDataValue } from "@passio/vault-ui/data";
import { useCallback, useEffect, useMemo, useState } from "react";

import { vault } from "./client";
import type { FullItem } from "./messages";

/** Dates arrive as ISO strings over the message boundary; the UI wants Dates. */
function hydrate(item: FullItem): DecryptedItem {
  return {
    id: item.id,
    data: item.data,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}

interface Loaded {
  live: { items: DecryptedItem[]; damaged: string[] };
  deleted: { items: DecryptedItem[]; damaged: string[] };
  folders: { id: string; name: string }[];
}

const EMPTY: Loaded = {
  live: { items: [], damaged: [] },
  deleted: { items: [], damaged: [] },
  folders: [],
};

/**
 * The extension's implementation of the shared vault UI's data interface.
 *
 * Every read and write is a message to the offscreen document, which is the
 * only context holding the vault key. Writes send PLAINTEXT and the offscreen
 * document encrypts, because encryption needs the key and this page must never
 * have it.
 *
 * There is no query cache here: after any write the whole vault is re-read.
 * A personal vault is small, the data is already local to the offscreen
 * document, and a stale list in a password manager is worse than a round trip.
 */
export function useExtensionVaultData(onLocked: () => void): {
  data: VaultDataValue;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof Error && /locked/i.test(err.message)) {
        onLocked();
        return;
      }
      setError("Cannot reach passio.");
    },
    [onLocked],
  );

  const reload = useCallback(() => {
    setError(null);
    void (async () => {
      try {
        const [live, deleted, folders] = await Promise.all([
          vault.itemsFull(),
          vault.deletedItems(),
          vault.folders(),
        ]);
        setLoaded({
          live: { items: live.items.map(hydrate), damaged: live.damaged },
          deleted: { items: deleted.items.map(hydrate), damaged: deleted.damaged },
          folders,
        });
      } catch (err) {
        handle(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  useEffect(reload, [reload]);

  const data = useMemo<VaultDataValue>(() => {
    const after = async (op: Promise<void>) => {
      await op;
      reload();
    };

    return {
      live: { ...loaded.live, isLoading: loading },
      deleted: { ...loaded.deleted, isLoading: loading },
      folders: loaded.folders,
      foldersLoading: loading,

      createItem: (id, item: Item) => after(vault.saveItem(id, item, true)),
      updateItem: (id, item: Item) => after(vault.saveItem(id, item, false)),
      deleteItem: (id) => after(vault.deleteItem(id)),
      restoreItem: (id) => after(vault.restoreItem(id)),
      createFolder: (id, name) => after(vault.saveFolder(id, name, true)),
      renameFolder: (id, name) => after(vault.saveFolder(id, name, false)),
      deleteFolder: (id) => after(vault.deleteFolder(id)),
    };
  }, [loaded, loading, reload]);

  return { data, loading, error, reload };
}
