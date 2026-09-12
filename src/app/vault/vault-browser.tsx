"use client";

import { ArrowLeft, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { FolderDialog } from "~/components/vault/folder-dialog";
import { ItemList } from "~/components/vault/item-list";
import { VaultOverview } from "~/components/vault/vault-overview";
import { VaultSidebar } from "~/components/vault/vault-sidebar";
import { useFolders, type DecryptedFolder } from "~/hooks/use-folders";
import type { DecryptedItem } from "~/lib/items/decrypt-vault";
import { useVault } from "~/hooks/use-vault";
import { useVaultItems } from "~/hooks/use-vault-items";
import {
  ALL_ITEMS,
  applyFilter,
  countByFolder,
  countByType,
  countTotp,
  type VaultFilter,
  type VaultView,
} from "~/lib/items/filter";
import { searchItems } from "~/lib/items/search";
import { api } from "~/trpc/react";

function describeFilter(filter: VaultFilter, folders: DecryptedFolder[]): string {
  switch (filter.kind) {
    case "all":
      return "All items";
    case "type":
      return { login: "Logins", note: "Secure notes", card: "Cards" }[filter.type];
    case "totp":
      return "Verification codes";
    case "unfiled":
      return "No folder";
    case "folder":
      return folders.find((f) => f.id === filter.folderId)?.name ?? "Folder";
    case "trash":
      return "Trash";
  }
}

export function VaultBrowser() {
  const { vaultKey } = useVault();
  const { items, damaged, isLoading } = useVaultItems(vaultKey);
  const { folders } = useFolders(vaultKey);
  const utils = api.useUtils();
  const removeFolder = api.folder.delete.useMutation();
  const restoreItem = api.item.restore.useMutation();
  const deleteItem = api.item.delete.useMutation();

  const [view, setView] = useState<VaultView>("overview");
  const [query, setQuery] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DecryptedFolder | undefined>();

  const knownFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

  const searching = query.trim().length > 0;

  /**
   * Desktop and phones browse differently on purpose.
   *
   * A phone opens on the category screen, because a flat list is hard to
   * navigate with no room for a sidebar. A desktop has the sidebar permanently
   * in view, so a category screen there would be a redundant extra click
   * between the user and their items - it opens straight on all items.
   *
   * Both share one `view` state; the split is pure CSS, so there is no
   * breakpoint guessing during hydration.
   */
  const atLanding = view === "overview" && !searching;
  const filter: VaultFilter = view === "overview" ? ALL_ITEMS : view;

  const inTrash = filter.kind === "trash";
  // Fetched only while trash is open, so deleted rows are not decrypted on
  // every visit to the vault.
  const deleted = useVaultItems(vaultKey, { deleted: inTrash });

  const source = inTrash ? deleted.items : items;
  const loading = inTrash ? deleted.isLoading : isLoading;

  // Both run in memory over the already-decrypted vault, so neither needs a
  // debounce and neither tells the server anything.
  const visible = searchItems(applyFilter(source, filter, knownFolderIds), query);

  const folderCounts = countByFolder(items);
  const typeCounts = countByType(items);
  const totpCount = countTotp(items);
  const unfiledCount = applyFilter(items, { kind: "unfiled" }, knownFolderIds).length;
  const trashCount = deleted.items.length;

  async function restore(itemId: string) {
    try {
      await restoreItem.mutateAsync({ id: itemId });
      await Promise.all([
        utils.item.list.invalidate(),
        utils.item.listDeleted.invalidate(),
      ]);
      toast.success("Item restored");
    } catch {
      toast.error("Could not restore that item.");
    }
  }

  async function softDelete(item: DecryptedItem) {
    if (!window.confirm(`Delete “${item.data.title}”? You can restore it from Trash.`)) {
      return;
    }

    try {
      await deleteItem.mutateAsync({ id: item.id });
      await Promise.all([
        utils.item.list.invalidate(),
        utils.item.listDeleted.invalidate(),
      ]);
      toast.success("Item deleted", { description: "You can restore it from Trash." });
    } catch {
      toast.error("Could not delete that item.");
    }
  }

  async function deleteFolder(folder: DecryptedFolder) {
    if (
      !window.confirm(
        `Delete the folder “${folder.name}”? Its items are kept and become unfiled.`,
      )
    ) {
      return;
    }

    try {
      await removeFolder.mutateAsync({ id: folder.id });
      await utils.folder.list.invalidate();
      setView("overview");
      toast.success("Folder deleted", { description: "Its items are now unfiled." });
    } catch {
      toast.error("Could not delete that folder.");
    }
  }

  const openFolderDialog = (existing?: DecryptedFolder) => {
    setEditingFolder(existing);
    setFolderDialogOpen(true);
  };

  const itemList = (
    <ItemList
      items={visible}
      damaged={inTrash ? deleted.damaged : damaged}
      query={query}
      onRestore={inTrash ? (item) => void restore(item.id) : undefined}
      onDelete={inTrash ? undefined : (item) => void softDelete(item)}
      emptyMessage={inTrash ? "Nothing deleted." : "Nothing here yet."}
    />
  );

  return (
    // items-start stops the sidebar's height stretching this pane, and
    // content-start stops each row inside it stretching to fill that height -
    // which is what put the search icon below its own input.
    <div className="grid items-start gap-6 md:grid-cols-[13rem_1fr] md:gap-8">
      <VaultSidebar
        view={view}
        onViewChange={setView}
        folders={folders}
        totalCount={items.length}
        totpCount={totpCount}
        typeCounts={typeCounts}
        folderCounts={folderCounts}
        unfiledCount={unfiledCount}
        trashCount={trashCount}
        onNewFolder={() => openFolderDialog()}
        onRenameFolder={openFolderDialog}
        onDeleteFolder={(folder) => void deleteFolder(folder)}
      />

      <div className="grid min-w-0 content-start gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate">
              {atLanding ? (
                <>
                  <span className="md:hidden">Your vault</span>
                  <span className="hidden md:inline">All items</span>
                </>
              ) : (
                describeFilter(filter, folders)
              )}
            </h1>
            <p className="text-muted-foreground text-sm">
              {loading
                ? "Decrypting…"
                : atLanding
                  ? `${items.length} ${items.length === 1 ? "item" : "items"}, encrypted on this device`
                  : `${visible.length} ${visible.length === 1 ? "item" : "items"}`}
            </p>
          </div>

          <Button render={<Link href="/vault/new" />} className="ml-auto">
            <Plus />
            Add item
          </Button>
        </div>

        <div className="relative flex items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your vault"
            aria-label="Search your vault"
            className="pl-9"
          />
        </div>

        {/* On a phone there is no sidebar, so this is the only way back up. */}
        {!atLanding ? (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start md:hidden"
            onClick={() => {
              setQuery("");
              setView("overview");
            }}
          >
            <ArrowLeft />
            All categories
          </Button>
        ) : null}

        {loading ? (
          <div className="grid gap-px overflow-hidden rounded-xl border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : atLanding ? (
          <>
            <div className="md:hidden">
              <VaultOverview
                onSelect={setView}
                folders={folders}
                totalCount={items.length}
                totpCount={totpCount}
                typeCounts={typeCounts}
                folderCounts={folderCounts}
                unfiledCount={unfiledCount}
                trashCount={trashCount}
                onNewFolder={() => openFolderDialog()}
              />
            </div>
            <div className="hidden md:block">{itemList}</div>
          </>
        ) : (
          itemList
        )}
      </div>

      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        existing={editingFolder}
      />
    </div>
  );
}
