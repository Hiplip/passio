"use client";

import { Check, ChevronDown, Folder, FolderPlus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@passio/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@passio/ui/dropdown-menu";
import { cn } from "@passio/ui/cn";
import type { DecryptedFolder } from "@passio/core/decrypt-folders";
import { filtersEqual, type FilterCounts, type VaultFilter } from "@passio/core/filter";
import type { ItemType } from "@passio/core/schema";

interface VaultFiltersProps {
  filter: VaultFilter;
  onFilterChange: (filter: VaultFilter) => void;
  folders: DecryptedFolder[];
  counts: FilterCounts;
  /** Folder management, offered only where it exists. The popup filters by
   *  folder but does not create them, so it passes none of these. */
  onNewFolder?: () => void;
  onRenameFolder?: (folder: DecryptedFolder) => void;
  onDeleteFolder?: (folder: DecryptedFolder) => void;
  /** Trash is a web-app and vault-window view; the popup has no room for it. */
  trashCount?: number;
  className?: string;
}

/**
 * One filter, as a stadium pill.
 *
 * Three shapes carry three meanings across the whole interface: a circle is an
 * identity (see ItemMark), a stadium is a filter state, a rounded rectangle is
 * an action. Keeping them apart is why a dense row of controls still parses at
 * a glance.
 *
 * The count rides the SELECTED pill and no other. A number on every pill made
 * the rail ragged - some labels carried one, some did not, and the ones reading
 * zero were an invitation to open an empty list. One number, on the thing you
 * are actually looking at, says more and costs less.
 */
function Pill({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[13px] whitespace-nowrap transition-colors outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      {active ? <span className="secret text-[11px] opacity-70">{count}</span> : null}
    </button>
  );
}

const TYPES: Array<{ type: ItemType; label: string }> = [
  { type: "login", label: "Logins" },
  { type: "note", label: "Notes" },
  { type: "card", label: "Cards" },
];

/**
 * Every way of narrowing the vault, on one line that never wraps.
 *
 * This replaced a 280-line desktop sidebar and a 200-line phone category
 * screen that did the same job twice. One rail works at both sizes, and having
 * a single implementation means a filter can never behave differently
 * depending on the width of the window.
 *
 * The line is built from two zones on purpose. The type pills scroll inside a
 * flexible track; the folder chooser is pinned beside it and never moves. The
 * first version let the whole row wrap, which at popup width dropped the
 * folder chooser onto a second line by itself, right-aligned, leaving an empty
 * band across the middle of the panel - the control needed least taking the
 * most room. A track that scrolls cannot do that at any width, with any number
 * of types, in any language.
 *
 * Folders live behind a menu rather than getting a pill each: a vault can hold
 * thirty of them, and thirty pills is not a filter rail, it is a wall.
 */
export function VaultFilters({
  filter,
  onFilterChange,
  folders,
  counts,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  trashCount,
  className,
}: VaultFiltersProps) {
  const activeFolder =
    filter.kind === "folder"
      ? folders.find((f) => f.id === filter.folderId)
      : undefined;

  const folderActive = filter.kind === "folder" || filter.kind === "unfiled";
  const folderLabel = activeFolder
    ? activeFolder.name
    : filter.kind === "unfiled"
      ? "No folder"
      : "Folders";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/*
        min-w-0 is what makes the track yield instead of shoving its neighbour
        off the line; the negative margin gives a focus ring somewhere to go
        without the scroller clipping it.
      */}
      <div className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
        <Pill
          label="All"
          count={counts.total}
          active={filtersEqual({ kind: "all" }, filter)}
          onSelect={() => onFilterChange({ kind: "all" })}
        />

        {TYPES.map(({ type, label }) => (
          <Pill
            key={type}
            label={label}
            count={counts.byType.get(type) ?? 0}
            active={filtersEqual({ kind: "type", type }, filter)}
            onSelect={() => onFilterChange({ kind: "type", type })}
          />
        ))}

        {/* Offered only when there is something to show. A pill reading zero is
            noise on a rail whose whole job is orientation. */}
        {counts.totp > 0 ? (
          <Pill
            label="Codes"
            count={counts.totp}
            active={filtersEqual({ kind: "totp" }, filter)}
            onSelect={() => onFilterChange({ kind: "totp" })}
          />
        ) : null}
      </div>

      <span className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Filter by folder"
                className={cn(
                  "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors outline-none",
                  "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  folderActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              />
            }
          >
            <Folder className="size-3.5 shrink-0" />
            <span className="max-w-24 truncate">{folderLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="min-w-52">
            {folders.map((folder) => {
              const active =
                filter.kind === "folder" && filter.folderId === folder.id;
              return (
                <DropdownMenuItem
                  key={folder.id}
                  className="gap-2 whitespace-nowrap"
                  onClick={() => onFilterChange({ kind: "folder", folderId: folder.id })}
                >
                  <Check
                    className={cn("size-3.5 shrink-0", active ? "" : "opacity-0")}
                  />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="secret text-muted-foreground text-[11px]">
                    {counts.byFolder.get(folder.id) ?? 0}
                  </span>
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuItem
              className="gap-2 whitespace-nowrap"
              onClick={() => onFilterChange({ kind: "unfiled" })}
            >
              <Check
                className={cn(
                  "size-3.5 shrink-0",
                  filter.kind === "unfiled" ? "" : "opacity-0",
                )}
              />
              <span className="min-w-0 flex-1">No folder</span>
              <span className="secret text-muted-foreground text-[11px]">
                {counts.unfiled}
              </span>
            </DropdownMenuItem>

            {/* The way back out. Choosing a folder switches the type pills off,
                so without this the only escape is spotting that "All" is no
                longer selected. */}
            {folderActive ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 whitespace-nowrap"
                  onClick={() => onFilterChange({ kind: "all" })}
                >
                  <Check className="size-3.5 shrink-0 opacity-0" />
                  <span className="min-w-0 flex-1">Any folder</span>
                </DropdownMenuItem>
              </>
            ) : null}

            {onNewFolder ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 whitespace-nowrap"
                  onClick={onNewFolder}
                >
                  <FolderPlus className="size-3.5 shrink-0" />
                  New folder
                </DropdownMenuItem>
              </>
            ) : null}

            {/* Rename and delete act on the folder currently being browsed, so
                they appear only when there is one - no naming it twice. */}
            {activeFolder && onRenameFolder && onDeleteFolder ? (
              <>
                <DropdownMenuItem
                  className="gap-2 whitespace-nowrap"
                  onClick={() => onRenameFolder(activeFolder)}
                >
                  <Pencil className="size-3.5 shrink-0" />
                  Rename “{activeFolder.name}”
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  className="gap-2 whitespace-nowrap"
                  onClick={() => onDeleteFolder(activeFolder)}
                >
                  <Trash2 className="size-3.5 shrink-0" />
                  Delete “{activeFolder.name}”
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {trashCount !== undefined ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Trash, ${trashCount} ${trashCount === 1 ? "item" : "items"}`}
            aria-pressed={filter.kind === "trash"}
            onClick={() => onFilterChange({ kind: "trash" })}
            className={cn(
              "rounded-full",
              filter.kind === "trash"
                ? "bg-accent text-accent-foreground hover:bg-accent"
                : "text-muted-foreground",
            )}
          >
            <Trash2 />
          </Button>
        ) : null}
      </span>
    </div>
  );
}
