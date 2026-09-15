"use client";

import {
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  Folder,
  FolderPlus,
  Inbox,
  KeyRound,
  LayoutList,
  Pencil,
  StickyNote,
  Trash2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@passio/ui/dropdown-menu";
import { cn } from "@passio/ui/cn";
import type { DecryptedFolder } from "@passio/core/decrypt-folders";
import type { FilterCounts, VaultFilter } from "@passio/core/filter";
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
  /** Trash is a web-app and vault-window view. Omitted, it is not offered. */
  trashCount?: number;
  className?: string;
}

const TYPES: Array<{ type: ItemType; label: string; Icon: typeof KeyRound }> = [
  { type: "login", label: "Logins", Icon: KeyRound },
  { type: "note", label: "Notes", Icon: StickyNote },
  { type: "card", label: "Cards", Icon: CreditCard },
];

/** What the chip says, and the icon it wears, for whatever is selected. */
function describe(
  filter: VaultFilter,
  folders: DecryptedFolder[],
  counts: FilterCounts,
  trashCount: number,
): { label: string; count: number; Icon: typeof KeyRound } {
  switch (filter.kind) {
    case "all":
      return { label: "All items", count: counts.total, Icon: LayoutList };
    case "type": {
      const entry = TYPES.find((t) => t.type === filter.type) ?? TYPES[0]!;
      return {
        label: entry.label,
        count: counts.byType.get(filter.type) ?? 0,
        Icon: entry.Icon,
      };
    }
    case "totp":
      return { label: "Verification codes", count: counts.totp, Icon: Clock };
    case "unfiled":
      return { label: "No folder", count: counts.unfiled, Icon: Inbox };
    case "folder": {
      const folder = folders.find((f) => f.id === filter.folderId);
      return {
        label: folder?.name ?? "Folder",
        count: counts.byFolder.get(filter.folderId) ?? 0,
        Icon: Folder,
      };
    }
    case "trash":
      return { label: "Trash", count: trashCount, Icon: Trash2 };
  }
}

/** One line of the menu: a tick, a name, and how many are behind it. */
function Choice({
  label,
  count,
  active,
  Icon,
  onSelect,
}: {
  label: string;
  count?: number;
  active: boolean;
  Icon: typeof KeyRound;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem className="gap-2.5 whitespace-nowrap" onClick={onSelect}>
      <Check className={cn("size-3.5 shrink-0", active ? "" : "opacity-0")} />
      <Icon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 pr-4">{label}</span>
      {count !== undefined ? (
        <span className="secret text-muted-foreground text-[11px]">{count}</span>
      ) : null}
    </DropdownMenuItem>
  );
}

/**
 * What the vault is currently showing, as one control.
 *
 * This began as a rail of pills with a folder chooser pushed to the far end,
 * and it was wrong twice over.
 *
 * It was wrong about space: five pills and a chooser do not fit across a 400px
 * popup, and because an `auto` grid track sizes to max-content and overflows
 * rather than clamping, the rail's width leaked out and dragged the search
 * field past the edge of the window with it.
 *
 * It was wrong about the model, which is the part worth keeping. A VaultFilter
 * is a tagged union: exactly one thing is selected, ever. Pills look like
 * independent toggles, so choosing a folder silently switching the type off
 * read as a bug rather than as the only behaviour there is. One chip naming
 * the single active scope tells the truth, and a menu holding types and
 * folders together shows them for what they are - alternatives, not layers.
 *
 * It also cannot cramp. The chip is as wide as its own label at any window
 * size, in any language, with any number of folders.
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
  const current = describe(filter, folders, counts, trashCount ?? 0);
  const { Icon } = current;

  // "All items" is the resting state and should look like one. Anything
  // narrower is a state you are in and need to be able to see you are in.
  const narrowed = filter.kind !== "all";

  const activeFolder =
    filter.kind === "folder"
      ? folders.find((f) => f.id === filter.folderId)
      : undefined;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Showing ${current.label}. Change what is shown.`}
              className={cn(
                "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-full pr-2.5 pl-3 text-[13px] transition-colors outline-none",
                "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                narrowed
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            />
          }
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{current.label}</span>
          <span className="secret shrink-0 text-[11px] opacity-70">
            {current.count}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="min-w-56">
          <Choice
            label="All items"
            count={counts.total}
            active={filter.kind === "all"}
            Icon={LayoutList}
            onSelect={() => onFilterChange({ kind: "all" })}
          />

          {TYPES.map(({ type, label, Icon: TypeIcon }) => (
            <Choice
              key={type}
              label={label}
              count={counts.byType.get(type) ?? 0}
              active={filter.kind === "type" && filter.type === type}
              Icon={TypeIcon}
              onSelect={() => onFilterChange({ kind: "type", type })}
            />
          ))}

          {/* Offered only when there is something to show. A row reading zero
              here is dead weight for anyone with no authenticator secrets. */}
          {counts.totp > 0 ? (
            <Choice
              label="Verification codes"
              count={counts.totp}
              active={filter.kind === "totp"}
              Icon={Clock}
              onSelect={() => onFilterChange({ kind: "totp" })}
            />
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-[11.5px] font-medium">
            Folders
          </DropdownMenuLabel>

          {folders.map((folder) => (
            <Choice
              key={folder.id}
              label={folder.name}
              count={counts.byFolder.get(folder.id) ?? 0}
              active={filter.kind === "folder" && filter.folderId === folder.id}
              Icon={Folder}
              onSelect={() => onFilterChange({ kind: "folder", folderId: folder.id })}
            />
          ))}

          <Choice
            label="No folder"
            count={counts.unfiled}
            active={filter.kind === "unfiled"}
            Icon={Inbox}
            onSelect={() => onFilterChange({ kind: "unfiled" })}
          />

          {trashCount !== undefined ? (
            <>
              <DropdownMenuSeparator />
              <Choice
                label="Trash"
                count={trashCount}
                active={filter.kind === "trash"}
                Icon={Trash2}
                onSelect={() => onFilterChange({ kind: "trash" })}
              />
            </>
          ) : null}

          {onNewFolder ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2.5 whitespace-nowrap"
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
                className="gap-2.5 whitespace-nowrap"
                onClick={() => onRenameFolder(activeFolder)}
              >
                <Pencil className="size-3.5 shrink-0" />
                Rename “{activeFolder.name}”
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="gap-2.5 whitespace-nowrap"
                onClick={() => onDeleteFolder(activeFolder)}
              >
                <Trash2 className="size-3.5 shrink-0" />
                Delete “{activeFolder.name}”
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
