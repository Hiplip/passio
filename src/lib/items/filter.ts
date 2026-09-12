import type { DecryptedItem } from "./decrypt-vault";
import type { ItemType } from "./schema";

/**
 * What the vault list is currently showing.
 *
 * A tagged union rather than a bag of optional fields, so "a folder and a type
 * at once" is unrepresentable and the sidebar always has exactly one thing
 * highlighted.
 */
export type VaultFilter =
  | { kind: "all" }
  | { kind: "type"; type: ItemType }
  | { kind: "folder"; folderId: string }
  | { kind: "unfiled" };

export const ALL_ITEMS: VaultFilter = { kind: "all" };

export function filtersEqual(a: VaultFilter, b: VaultFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "type" && b.kind === "type") return a.type === b.type;
  if (a.kind === "folder" && b.kind === "folder") return a.folderId === b.folderId;
  return true;
}

/**
 * Applies the sidebar selection.
 *
 * `knownFolderIds` decides what "unfiled" means. An item pointing at a folder
 * that no longer exists is unfiled, not invisible - deleting a folder cannot
 * cascade to its items, because the server cannot read which items reference
 * it, so without this those items would vanish from every view.
 */
export function applyFilter(
  items: DecryptedItem[],
  filter: VaultFilter,
  knownFolderIds: ReadonlySet<string>,
): DecryptedItem[] {
  switch (filter.kind) {
    case "all":
      return items;
    case "type":
      return items.filter((item) => item.data.type === filter.type);
    case "folder":
      return items.filter((item) => item.data.folderId === filter.folderId);
    case "unfiled":
      return items.filter((item) => {
        const id = item.data.folderId;
        return id === undefined || !knownFolderIds.has(id);
      });
  }
}

/** How many items each folder holds, for the counts beside the sidebar entries. */
export function countByFolder(items: DecryptedItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = item.data.folderId;
    if (id === undefined) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function countByType(items: DecryptedItem[]): Map<ItemType, number> {
  const counts = new Map<ItemType, number>();
  for (const item of items) {
    counts.set(item.data.type, (counts.get(item.data.type) ?? 0) + 1);
  }
  return counts;
}
