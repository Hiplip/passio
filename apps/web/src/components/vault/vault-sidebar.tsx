"use client";

import {
  Clock,
  CreditCard,
  Folder,
  FolderPlus,
  Inbox,
  KeyRound,
  LayoutList,
  MoreHorizontal,
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
import type { DecryptedFolder } from "~/hooks/use-folders";
import { viewsEqual, type VaultView } from "@passio/core/filter";
import type { ItemType } from "@passio/core/schema";
import { cn } from "~/lib/utils";

interface Entry {
  key: string;
  label: string;
  count?: number;
  view: VaultView;
  Icon: typeof KeyRound;
}

const TYPE_ENTRIES: Array<{ type: ItemType; label: string; Icon: typeof KeyRound }> = [
  { type: "login", label: "Logins", Icon: KeyRound },
  { type: "note", label: "Secure notes", Icon: StickyNote },
  { type: "card", label: "Cards", Icon: CreditCard },
];

interface VaultSidebarProps {
  view: VaultView;
  onViewChange: (view: VaultView) => void;
  folders: DecryptedFolder[];
  totalCount: number;
  totpCount: number;
  typeCounts: Map<ItemType, number>;
  folderCounts: Map<string, number>;
  unfiledCount: number;
  trashCount: number;
  onNewFolder: () => void;
  onRenameFolder: (folder: DecryptedFolder) => void;
  onDeleteFolder: (folder: DecryptedFolder) => void;
}

function SidebarButton({
  entry,
  active,
  onSelect,
  countClassName,
}: {
  entry: Entry;
  active: boolean;
  onSelect: () => void;
  countClassName?: string;
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
        <span
          className={cn(
            "secret w-5 text-right text-xs opacity-70 transition-opacity",
            countClassName,
          )}
        >
          {entry.count}
        </span>
      ) : null}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground px-2.5 pb-1 text-xs font-medium">{children}</p>
  );
}

/**
 * Desktop navigation.
 *
 * Hidden on phones on purpose: there the browse screen is the navigation, and a
 * duplicate control would be two ways to do one thing on the smallest screen.
 */
export function VaultSidebar({
  view,
  onViewChange,
  folders,
  totalCount,
  totpCount,
  typeCounts,
  folderCounts,
  unfiledCount,
  trashCount,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
}: VaultSidebarProps) {
  // The landing state shows all items on desktop, so that is what should read
  // as selected - "overview" is a phone-only screen.
  const selected: VaultView = view === "overview" ? { kind: "all" } : view;
  // No "Overview" entry: on desktop the sidebar IS the overview, and the
  // landing state already shows all items, so it would be a row that changes
  // nothing.
  const primary: Entry[] = [
    {
      key: "all",
      label: "All items",
      count: totalCount,
      view: { kind: "all" },
      Icon: LayoutList,
    },
  ];
  if (totpCount > 0) {
    primary.push({
      key: "totp",
      label: "Verification codes",
      count: totpCount,
      view: { kind: "totp" },
      Icon: Clock,
    });
  }

  const types: Entry[] = TYPE_ENTRIES.map(({ type, label, Icon }) => ({
    key: `type:${type}`,
    label,
    count: typeCounts.get(type) ?? 0,
    view: { kind: "type", type },
    Icon,
  }));

  const folderEntries: Entry[] = [
    ...folders.map((f) => ({
      key: `folder:${f.id}`,
      label: f.name,
      count: folderCounts.get(f.id) ?? 0,
      view: { kind: "folder" as const, folderId: f.id },
      Icon: Folder,
    })),
    {
      key: "unfiled",
      label: "No folder",
      count: unfiledCount,
      view: { kind: "unfiled" },
      Icon: Inbox,
    },
  ];

  return (
    <nav aria-label="Filter your vault" className="hidden w-52 shrink-0 md:block">
      <div className="sticky top-20 grid gap-5">
        <div className="grid gap-0.5">
          {primary.map((entry) => (
            <SidebarButton
              key={entry.key}
              entry={entry}
              active={viewsEqual(entry.view, selected)}
              onSelect={() => onViewChange(entry.view)}
            />
          ))}
        </div>

        <div className="grid gap-0.5">
          <SectionLabel>Types</SectionLabel>
          {types.map((entry) => (
            <SidebarButton
              key={entry.key}
              entry={entry}
              active={viewsEqual(entry.view, selected)}
              onSelect={() => onViewChange(entry.view)}
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

          {folderEntries.map((entry) => {
            const folder = folders.find((f) => `folder:${f.id}` === entry.key);
            return (
              <div key={entry.key} className="group/row relative">
                <SidebarButton
                  entry={entry}
                  active={viewsEqual(entry.view, selected)}
                  onSelect={() => onViewChange(entry.view)}
                  // The count steps aside for the menu rather than making room
                  // for it, so the row never changes width.
                  countClassName={
                    folder
                      ? "group-hover/row:opacity-0 group-focus-within/row:opacity-0"
                      : undefined
                  }
                />

                {folder ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Manage ${folder.name}`}
                          className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="whitespace-nowrap"
                        onClick={() => onRenameFolder(folder)}
                      >
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        className="whitespace-nowrap"
                        onClick={() => onDeleteFolder(folder)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="grid gap-0.5 border-t pt-4">
          <SidebarButton
            entry={{
              key: "trash",
              label: "Trash",
              count: trashCount,
              view: { kind: "trash" },
              Icon: Trash2,
            }}
            active={viewsEqual({ kind: "trash" }, selected)}
            onSelect={() => onViewChange({ kind: "trash" })}
          />
        </div>
      </div>
    </nav>
  );
}
