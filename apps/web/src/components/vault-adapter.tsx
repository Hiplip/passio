"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { encryptItem, folderAad, itemAad, type VaultKey } from "@passio/crypto";
import type { Item } from "@passio/core/schema";
import { VaultDataProvider, type VaultDataValue } from "@passio/vault-ui/data";
import { NavigationProvider, type Navigation } from "@passio/vault-ui/navigation";
import { useFolders } from "~/hooks/use-folders";
import { useVault } from "~/hooks/use-vault";
import { useVaultItems } from "~/hooks/use-vault-items";
import { api } from "~/trpc/react";

/**
 * The web app's implementation of the shared vault UI's two dependencies.
 *
 * Navigation is Next's router. Data is tRPC plus the vault key held in React
 * memory. The extension supplies the same two interfaces over messages to its
 * offscreen document, which is how one set of components serves both.
 */
export function VaultAdapter({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { vaultKey } = useVault();

  const live = useVaultItems(vaultKey);
  const deleted = useVaultItems(vaultKey, { deleted: true });
  const { folders, isLoading: foldersLoading } = useFolders(vaultKey);

  const utils = api.useUtils();
  const createItemM = api.item.create.useMutation();
  const updateItemM = api.item.update.useMutation();
  const deleteItemM = api.item.delete.useMutation();
  const restoreItemM = api.item.restore.useMutation();
  const createFolderM = api.folder.create.useMutation();
  const renameFolderM = api.folder.rename.useMutation();
  const deleteFolderM = api.folder.delete.useMutation();

  const navigation = useMemo<Navigation>(
    () => ({ navigate: (to) => router.push(to), Link: NextLink }),
    [router],
  );

  const data = useMemo<VaultDataValue>(() => {
    /** Every write needs the key. A locked vault cannot save, and saying so is
     *  better than failing somewhere less obvious. */
    function requireKey(): VaultKey {
      if (!vaultKey) throw new Error("The vault is locked.");
      return vaultKey;
    }

    const refreshItems = async () => {
      await Promise.all([
        utils.item.list.invalidate(),
        utils.item.listDeleted.invalidate(),
      ]);
    };

    return {
      live: { items: live.items, damaged: live.damaged, isLoading: live.isLoading },
      deleted: {
        items: deleted.items,
        damaged: deleted.damaged,
        isLoading: deleted.isLoading,
      },
      folders,
      foldersLoading,

      async createItem(id, item: Item) {
        const ciphertext = await encryptItem(item, requireKey(), itemAad(id));
        await createItemM.mutateAsync({ id, ciphertext });
        await refreshItems();
      },
      async updateItem(id, item: Item) {
        const ciphertext = await encryptItem(item, requireKey(), itemAad(id));
        await updateItemM.mutateAsync({ id, ciphertext });
        await refreshItems();
      },
      async deleteItem(id) {
        await deleteItemM.mutateAsync({ id });
        await refreshItems();
      },
      async restoreItem(id) {
        await restoreItemM.mutateAsync({ id });
        await refreshItems();
      },

      async createFolder(id, name) {
        const ciphertext = await encryptItem({ name }, requireKey(), folderAad(id));
        await createFolderM.mutateAsync({ id, ciphertext });
        await utils.folder.list.invalidate();
      },
      async renameFolder(id, name) {
        const ciphertext = await encryptItem({ name }, requireKey(), folderAad(id));
        await renameFolderM.mutateAsync({ id, ciphertext });
        await utils.folder.list.invalidate();
      },
      async deleteFolder(id) {
        await deleteFolderM.mutateAsync({ id });
        await Promise.all([utils.folder.list.invalidate(), refreshItems()]);
      },
    };
  }, [
    vaultKey, live, deleted, folders, foldersLoading, utils,
    createItemM, updateItemM, deleteItemM, restoreItemM,
    createFolderM, renameFolderM, deleteFolderM,
  ]);

  return (
    <NavigationProvider value={navigation}>
      <VaultDataProvider value={data}>{children}</VaultDataProvider>
    </NavigationProvider>
  );
}
