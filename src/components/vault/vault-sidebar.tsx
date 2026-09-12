"use client";

import {
  CreditCard,
  Folder,
  FolderPlus,
  Inbox,
  KeyRound,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  StickyNote,
  Trash2,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { DecryptedFolder } from "~/hooks/use-folders";
import { filtersEqual, type VaultFilter } from "~/lib/items/filter";
import type { ItemType } from "~/lib/items/schema";
import { cn } from "~/lib/utils";

interface Entry {
  key: string;
  label: string;
  count?: number;
  filter: VaultFilter;
  Icon: typeof KeyRound;
}

const TYPE_ENTRIES: Array<{ type: ItemType; label: string; Icon: typeof KeyRound }> = [
  { type: "login", label: "Logins", Icon: KeyRound },
  { type: "note", label: "Notes", Icon: StickyNote },
  { type: "card", label: "Cards", Icon: CreditCard },
];

interface VaultSidebarProps {
  filter: VaultFilter;
  onFilterChange: (filter: VaultFilter) => void;
  folders: DecryptedFolder[];
  totalCount: number;
  typeCounts: Map<ItemType, number>;
  folderCounts: Map<string, number>;
  unfiledCount: number;
  onNewFolder: () => void;
  onRenameFolder: (folder: DecryptedFolder) => void;
  onDeleteFolder: (folder: DecryptedFolder) => void;
}

function buildEntries({
  folders,
  totalCount,
  typeCounts,
  folderCounts,
  unfiledCount,
}: Pick<
  VaultSidebarProps,
  "folders" | "totalCount" | "typeCounts" | "folderCounts" | "unfiledCount"
>): { primary: Entry[]; types: Entry[]; folders: Entry[] } {
  return {
    primary: [
      {
        key: "all",
        label: "All items",
        count: totalCount,
        filter: { kind: "all" },
        Icon: LayoutGrid,
      },
    ],
    types: TYPE_ENTRIES.map(({ type, label, Icon }) => ({
      key: `type:${type}`,
      label,
      count: typeCounts.get(type) ?? 0,
      filter: { kind: "type", type },
      Icon,
    })),
    folders: [
      ...folders.map((f) => ({
        key: `folder:${f.id}`,
        label: f.name,
        count: folderCounts.get(f.id) ?? 0,
        filter: { kind: "folder" as const, folderId: f.id },
        Icon: Folder,
      })),
      {
        key: "unfiled",
        label: "No folder",
        count: unfiledCount,
        filter: { kind: "unfiled" },
        Icon: Inbox,
      },
    ],
  };
}

function SidebarButton({
  entry,
  active,
  onSelect,
}: {
  entry: Entry;
  active: boolean;
  onSelect: () => void;
}) {
  const { Icon } = entry;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.count !== undefined ? (
        <span className="secret text-xs opacity-70">{entry.count}</span>
      ) : null}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground px-2.5 pb-1 text-xs font-medium">{children}</p>
  );
}

export function VaultSidebar(props: VaultSidebarProps) {
  const { filter, onFilterChange, folders, onNewFolder, onRenameFolder, onDeleteFolder } =
    props;
  const entries = buildEntries(props);
  const flat = [...entries.primary, ...entries.types, ...entries.folders];

  return (
    <>
      {/* Mobile: one compact control, so a long folder list does not push the
          vault off the screen. */}
      <div className="md:hidden">
        <Select
          value={flat.find((e) => filtersEqual(e.filter, filter))?.key ?? "all"}
          onValueChange={(key) => {
            const match = flat.find((e) => e.key === key);
            if (match) onFilterChange(match.filter);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {flat.map((entry) => (
              <SelectItem key={entry.key} value={entry.key}>
                {entry.label}
                {entry.count !== undefined ? ` (${entry.count})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav aria-label="Filter your vault" className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-20 grid gap-5">
          <div className="grid gap-0.5">
            {entries.primary.map((entry) => (
              <SidebarButton
                key={entry.key}
                entry={entry}
                active={filtersEqual(entry.filter, filter)}
                onSelect={() => onFilterChange(entry.filter)}
              />
            ))}
          </div>

          <div className="grid gap-0.5">
            <SectionLabel>Types</SectionLabel>
            {entries.types.map((entry) => (
              <SidebarButton
                key={entry.key}
                entry={entry}
                active={filtersEqual(entry.filter, filter)}
                onSelect={() => onFilterChange(entry.filter)}
              />
            ))}
          </div>

          <div className="grid gap-0.5">
            <div className="flex items-center justify-between pr-1">
              <SectionLabel>Folders</SectionLabel>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onNewFolder}
                aria-label="New folder"
              >
                <FolderPlus />
              </Button>
            </div>

            {entries.folders.map((entry) => {
              const folder = folders.find((f) => `folder:${f.id}` === entry.key);
              return (
                <div key={entry.key} className="group/row flex items-center gap-1">
                  <SidebarButton
                    entry={entry}
                    active={filtersEqual(entry.filter, filter)}
                    onSelect={() => onFilterChange(entry.filter)}
                  />

                  {folder ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Manage ${folder.name}`}
                            className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onRenameFolder(folder)}>
                          <Pencil />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDeleteFolder(folder)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
