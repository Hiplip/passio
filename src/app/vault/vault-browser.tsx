"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { FolderDialog } from "~/components/vault/folder-dialog";
import { ItemList } from "~/components/vault/item-list";
import { VaultSidebar } from "~/components/vault/vault-sidebar";
import { useFolders, type DecryptedFolder } from "~/hooks/use-folders";
import { useVault } from "~/hooks/use-vault";
import { useVaultItems } from "~/hooks/use-vault-items";
import {
  ALL_ITEMS,
  applyFilter,
  countByFolder,
  countByType,
  type VaultFilter,
} from "~/lib/items/filter";
import { searchItems } from "~/lib/items/search";
import { api } from "~/trpc/react";

function describeFilter(filter: VaultFilter, folders: DecryptedFolder[]): string {
  switch (filter.kind) {
    case "all":
      return "All items";
    case "type":
      return { login: "Logins", note: "Notes", card: "Cards" }[filter.type];
    case "unfiled":
      return "No folder";
    case "folder":
      return folders.find((f) => f.id === filter.folderId)?.name ?? "Folder";
  }
}

export function VaultBrowser() {
  const { vaultKey } = useVault();
  const { items, damaged, isLoading } = useVaultItems(vaultKey);
  const { folders } = useFolders(vaultKey);
  const utils = api.useUtils();
  const removeFolder = api.folder.delete.useMutation();

  const [filter, setFilter] = useState<VaultFilter>(ALL_ITEMS);
  const [query, setQuery] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DecryptedFolder | undefined>();

  const knownFolderIds = useMemo(
    () => new Set(folders.map((f) => f.id)),
    [folders],
  );

  // Both run in memory over the already-decrypted vault, so neither needs a
  // debounce and neither tells the server anything.
  const filtered = applyFilter(items, filter, knownFolderIds);
  const visible = searchItems(filtered, query);

  const folderCounts = countByFolder(items);
  const typeCounts = countByType(items);
  const unfiledCount = applyFilter(items, { kind: "unfiled" }, knownFolderIds).length;

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
      setFilter(ALL_ITEMS);
      toast.success("Folder deleted", { description: "Its items are now unfiled." });
    } catch {
      toast.error("Could not delete that folder.");
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[13rem_1fr] md:gap-8">
      <VaultSidebar
        filter={filter}
        onFilterChange={setFilter}
        folders={folders}
        totalCount={items.length}
        typeCounts={typeCounts}
        folderCounts={folderCounts}
        unfiledCount={unfiledCount}
        onNewFolder={() => {
          setEditingFolder(undefined);
          setFolderDialogOpen(true);
        }}
        onRenameFolder={(folder) => {
          setEditingFolder(folder);
          setFolderDialogOpen(true);
        }}
        onDeleteFolder={(folder) => void deleteFolder(folder)}
      />

      <div className="grid min-w-0 gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate">{describeFilter(filter, folders)}</h1>
            <p className="text-muted-foreground text-sm">
              {isLoading
                ? "Decrypting…"
                : `${filtered.length} ${filtered.length === 1 ? "item" : "items"}, encrypted on this device`}
            </p>
          </div>

          <Button render={<Link href="/vault/new" />} className="ml-auto">
            <Plus />
            Add item
          </Button>
        </div>

        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username or site"
            aria-label="Search your vault"
            className="pl-9"
          />
        </div>

        {isLoading ? (
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
        ) : (
          <ItemList items={visible} damaged={damaged} query={query} />
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
