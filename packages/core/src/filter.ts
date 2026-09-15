import type { DecryptedItem } from "./decrypt-vault";
import type { ItemType } from "./schema";

/**
 * What the vault list is currently showing.
 *
 * A tagged union rather than a bag of optional fields, so "a folder and a type
 * at once" is unrepresentable and the filter rail always has exactly one thing
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
 * Applies the filter rail's selection.
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

/** The flat shape every rule below works on, from a decrypted item. */
function toFilterable(item: DecryptedItem): Filterable {
  return {
    type: item.data.type,
    folderId: item.data.folderId,
    hasTotp: hasTotp(item),
  };
}

export function applyFilter(
  items: DecryptedItem[],
  filter: VaultFilter,
  knownFolderIds: ReadonlySet<string>,
): DecryptedItem[] {
  return items.filter((item) =>
    matches(toFilterable(item), filter, knownFolderIds),
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

/** Every number the filter rail shows, in one pass. */
export interface FilterCounts {
  total: number;
  totp: number;
  byType: Map<ItemType, number>;
  byFolder: Map<string, number>;
  unfiled: number;
}

/**
 * Counts each filter's contents.
 *
 * One pass, one implementation, over the flat shape both clients can produce -
 * so a pill in the web app and the same pill in the extension popup can never
 * disagree about how many items are behind it.
 */
export function countFilters(
  items: readonly Filterable[],
  knownFolderIds: ReadonlySet<string>,
): FilterCounts {
  const byType = new Map<ItemType, number>();
  const byFolder = new Map<string, number>();
  let totp = 0;
  let unfiled = 0;

  for (const item of items) {
    byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
    if (item.hasTotp) totp += 1;

    if (item.folderId !== undefined && knownFolderIds.has(item.folderId)) {
      byFolder.set(item.folderId, (byFolder.get(item.folderId) ?? 0) + 1);
    } else {
      // A dangling folder id counts as unfiled, matching where the item is
      // actually shown.
      unfiled += 1;
    }
  }

  return { total: items.length, totp, byType, byFolder, unfiled };
}

/** How many items each folder holds, for the counts on the filter rail. */
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

/** `countFilters` over already-decrypted items. */
export function countItemFilters(
  items: DecryptedItem[],
  knownFolderIds: ReadonlySet<string>,
): FilterCounts {
  return countFilters(items.map(toFilterable), knownFolderIds);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Scope: what the vault is narrowed to, on two independent axes.
 *
 * A VaultFilter is a tagged union - one thing at a time - which is right for
 * the rules but wrong for the controls. Folder and type are different
 * questions and a person expects to answer both: "my work cards" is a sensible
 * thing to ask for, and a single union cannot express it.
 *
 * So a scope holds one choice per axis and composes them by applying the
 * filters in turn. The rules themselves are untouched; this only decides how
 * many of them run.
 * ──────────────────────────────────────────────────────────────────────────── */

/** No narrowing on that axis. */
export const ANY = "any";
/** Items belonging to no folder, or to one that has since been deleted. */
export const NO_FOLDER = "none";

export type TypeChoice = typeof ANY | ItemType | "totp";
/** `ANY`, `NO_FOLDER`, or a folder id. Ids are UUIDs, so neither sentinel can
 *  collide with one. */
export type FolderChoice = string;

export interface VaultScope {
  type: TypeChoice;
  folder: FolderChoice;
  /** Trash swaps which list is being shown, rather than narrowing it. The two
   *  axes still apply inside it, so a deleted card is findable the same way a
   *  live one is. */
  trash: boolean;
}

export const WHOLE_VAULT: VaultScope = { type: ANY, folder: ANY, trash: false };

/** True when the scope hides anything at all. Drives whether the controls
 *  should look like a state you are in. */
export function isNarrowed(scope: VaultScope): boolean {
  return scope.type !== ANY || scope.folder !== ANY || scope.trash;
}

/** The scope, as the filters it is built from. Empty means "show everything". */
export function scopeFilters(scope: VaultScope): VaultFilter[] {
  const filters: VaultFilter[] = [];

  if (scope.type === "totp") filters.push({ kind: "totp" });
  else if (scope.type !== ANY) filters.push({ kind: "type", type: scope.type });

  if (scope.folder === NO_FOLDER) filters.push({ kind: "unfiled" });
  else if (scope.folder !== ANY) filters.push({ kind: "folder", folderId: scope.folder });

  return filters;
}

/** Narrows a flat summary list. */
export function applyScope<T extends Filterable>(
  items: T[],
  scope: VaultScope,
  knownFolderIds: ReadonlySet<string>,
): T[] {
  return scopeFilters(scope).reduce(
    (list, filter) => applySummaryFilter(list, filter, knownFolderIds),
    items,
  );
}

/** The same, over already-decrypted items. */
export function applyItemScope(
  items: DecryptedItem[],
  scope: VaultScope,
  knownFolderIds: ReadonlySet<string>,
): DecryptedItem[] {
  return scopeFilters(scope).reduce(
    (list, filter) => applyFilter(list, filter, knownFolderIds),
    items,
  );
}
