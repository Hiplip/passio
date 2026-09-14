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
  /** Logins carrying an authenticator secret. Reaching a code is the most
   *  time-critical thing anyone does in a password manager. */
  | { kind: "totp" }
  | { kind: "unfiled" }
  /** Deleted items. The caller supplies the deleted list; this kind does no
   *  filtering of its own, because trash is a different data source rather
   *  than a subset of the live vault. */
  | { kind: "trash" };

export const ALL_ITEMS: VaultFilter = { kind: "all" };

/** What the vault screen is showing: the browse screen, or one filter. */
export type VaultView = VaultFilter | "overview";

export function viewsEqual(a: VaultView, b: VaultView): boolean {
  if (a === "overview" || b === "overview") return a === b;
  return filtersEqual(a, b);
}

/** True when an item can produce a one-time code. */
export function hasTotp(item: DecryptedItem): boolean {
  return item.data.type === "login" && item.data.totp !== undefined;
}

export function countTotp(items: DecryptedItem[]): number {
  return items.filter(hasTotp).length;
}

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
/** The only three things any filter looks at, in whichever shape they arrive. */
export interface Filterable {
  type: ItemType;
  folderId?: string;
  hasTotp: boolean;
}

function matches(
  item: Filterable,
  filter: VaultFilter,
  knownFolderIds: ReadonlySet<string>,
): boolean {
  switch (filter.kind) {
    case "all":
    case "trash":
      return true;
    case "type":
      return item.type === filter.type;
    case "totp":
      return item.hasTotp;
    case "folder":
      return item.folderId === filter.folderId;
    case "unfiled":
      // An item pointing at a folder that no longer exists is unfiled, not
      // invisible. Losing sight of an item is worse than misfiling it.
      return item.folderId === undefined || !knownFolderIds.has(item.folderId);
  }
}

export function applyFilter(
  items: DecryptedItem[],
  filter: VaultFilter,
  knownFolderIds: ReadonlySet<string>,
): DecryptedItem[] {
  return items.filter((item) =>
    matches(
      {
        type: item.data.type,
        folderId: item.data.folderId,
        hasTotp: hasTotp(item),
      },
      filter,
      knownFolderIds,
    ),
  );
}

/**
 * The same filter over the extension's flat summary shape.
 *
 * Shares `matches` with `applyFilter` rather than reimplementing the rules, so
 * the two clients cannot drift into disagreeing about which folder an item is
 * in - and in particular so both keep treating a dangling folder id as unfiled
 * rather than hiding the item.
 */
export function applySummaryFilter<T extends Filterable>(
  items: T[],
  filter: VaultFilter,
  knownFolderIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => matches(item, filter, knownFolderIds));
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
