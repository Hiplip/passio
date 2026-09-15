"use client";

import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@passio/ui/button";
import { Input } from "@passio/ui/input";
import { Skeleton } from "@passio/ui/skeleton";
import { routes, useNavigation } from "./navigation";
import { EmptyState } from "./empty-state";
import { FolderDialog } from "./folder-dialog";
import { ItemList } from "./item-list";
import { VaultFilters } from "./vault-filters";
import type { DecryptedFolder } from "@passio/core/decrypt-folders";
import type { DecryptedItem } from "@passio/core/decrypt-vault";
import { useVaultData } from "./data";
import { applyFilter, countItemFilters, type VaultFilter } from "@passio/core/filter";
import { searchItems } from "@passio/core/search";

function describeFilter(filter: VaultFilter, folders: DecryptedFolder[]): string {
  switch (filter.kind) {
    case "all":
      return "Vault";
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
  const { Link } = useNavigation();
  const {
    live,
    deleted,
    folders,
    deleteFolder: removeFolder,
    restoreItem,
    deleteItem,
  } = useVaultData();
  const { items, damaged, isLoading } = live;

  const [filter, setFilter] = useState<VaultFilter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<DecryptedFolder | undefined>();

  const knownFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

  const searching = query.trim().length > 0;
  const inTrash = filter.kind === "trash";

  // Damaged rows are still in the trash, so they count toward the badge. An
  // item missing from the count is the bug that made trash read 1 and then
  // show nothing.
  const trashCount = deleted.items.length + deleted.damaged.length;

  const source = inTrash ? deleted.items : items;
  const loading = inTrash ? deleted.isLoading : isLoading;

  // Both run in memory over the already-decrypted vault, so neither needs a
  // debounce and neither tells the server anything.
  const visible = searchItems(applyFilter(source, filter, knownFolderIds), query);

  const counts = countItemFilters(items, knownFolderIds);

  async function restore(itemId: string) {
    try {
      await restoreItem(itemId);
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
      await deleteItem(item.id);
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
      await removeFolder(folder.id);
      setFilter({ kind: "all" });
      toast.success("Folder deleted", { description: "Its items are now unfiled." });
    } catch {
      toast.error("Could not delete that folder.");
    }
  }

  const openFolderDialog = (existing?: DecryptedFolder) => {
    setEditingFolder(existing);
    setFolderDialogOpen(true);
  };

  const title = searching ? "Results" : describeFilter(filter, folders);
  const count = searching || filter.kind !== "all" ? visible.length : items.length;

  const empty = searching ? (
    <EmptyState
      title={`Nothing matches “${query.trim()}”`}
      hint="Search looks at names, usernames and web addresses — never at what is inside an item."
      action={
        <Button variant="outline" size="sm" onClick={() => setQuery("")}>
          Clear search
        </Button>
      }
    />
  ) : inTrash ? (
    <EmptyState
      title="Trash is empty"
      hint="Items you delete land here first, so nothing is ever lost to a mis-click."
    />
  ) : items.length === 0 ? (
    <EmptyState
      title="Your vault is empty"
      hint="Add your first login and passio will offer it the next time you meet that sign-in form."
      action={
        <Button render={<Link href={routes.newItem} />}>
          <Plus />
          Add your first item
        </Button>
      }
    />
  ) : (
    <EmptyState
      title="Nothing in this filter"
      hint="Pick another filter above, or add an item here."
      action={
        <Button variant="outline" size="sm" onClick={() => setFilter({ kind: "all" })}>
          Show all items
        </Button>
      }
    />
  );

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate">{title}</h1>
          <p className="text-muted-foreground text-[13px]">
            {loading
              ? "Decrypting…"
              : searching || filter.kind !== "all"
                ? `${count} ${count === 1 ? "item" : "items"}`
                : `${count} ${count === 1 ? "item" : "items"}, encrypted on this device`}
          </p>
        </div>

        <Button render={<Link href={routes.newItem} />} size="lg">
          <Plus />
          Add item
        </Button>
      </div>

      {/*
        Search is the hero, not the sidebar this replaced. In a personal vault
        you look something up far more often than you browse a category, so the
        thing you use most is the largest thing on the screen.
      */}
      <div className="relative flex items-center">
        <Search className="text-muted-foreground pointer-events-none absolute left-4 size-[18px]" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your vault"
          aria-label="Search your vault"
          className="h-12 rounded-xl pr-11 pl-12 text-[15px] [&::-webkit-search-cancel-button]:hidden"
        />
        {searching ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="text-muted-foreground absolute right-2 rounded-full"
          >
            <X />
          </Button>
        ) : null}
      </div>

      <VaultFilters
        filter={filter}
        onFilterChange={(next) => {
          setQuery("");
          setFilter(next);
        }}
        folders={folders}
        counts={counts}
        trashCount={trashCount}
        onNewFolder={() => openFolderDialog()}
        onRenameFolder={openFolderDialog}
        onDeleteFolder={(folder) => void deleteFolder(folder)}
      />

      {loading ? (
        <ul className="rows border-border border-y">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3.5 py-2.5 pl-2">
              <Skeleton className="size-9 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ItemList
          items={visible}
          damaged={inTrash ? deleted.damaged : damaged}
          empty={empty}
          onRestore={inTrash ? (item) => void restore(item.id) : undefined}
          onDelete={inTrash ? undefined : (item) => void softDelete(item)}
        />
      )}

      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        existing={editingFolder}
      />
    </div>
  );
}
