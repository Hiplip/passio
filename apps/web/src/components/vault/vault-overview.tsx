"use client";

import {
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Folder,
  FolderPlus,
  Inbox,
  KeyRound,
  LayoutGrid,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@passio/ui/button";
import type { DecryptedFolder } from "~/hooks/use-folders";
import type { VaultFilter } from "@passio/core/filter";
import type { ItemType } from "@passio/core/schema";

interface Row {
  key: string;
  label: string;
  count: number;
  filter: VaultFilter;
  Icon: typeof KeyRound;
}

const TYPE_ROWS: Array<{ type: ItemType; label: string; Icon: typeof KeyRound }> = [
  { type: "login", label: "Logins", Icon: KeyRound },
  { type: "note", label: "Secure notes", Icon: StickyNote },
  { type: "card", label: "Cards", Icon: CreditCard },
];

interface VaultOverviewProps {
  onSelect: (filter: VaultFilter) => void;
  folders: DecryptedFolder[];
  totalCount: number;
  totpCount: number;
  typeCounts: Map<ItemType, number>;
  folderCounts: Map<string, number>;
  unfiledCount: number;
  trashCount: number;
  onNewFolder: () => void;
}

/** A collapsible group of rows, matching how a phone vault is usually browsed. */
function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          {title} ({count})
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
          />
        </button>
        <div className="ml-auto">{action}</div>
      </div>

      {open ? (
        <ul className="divide-border bg-card divide-y overflow-hidden rounded-xl border">
          {children}
        </ul>
      ) : null}
    </section>
  );
}

function OverviewRow({ row, onSelect }: { row: Row; onSelect: () => void }) {
  const { Icon } = row;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="hover:bg-muted/60 focus-visible:bg-muted/60 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors outline-none"
      >
        <span className="text-muted-foreground grid size-8 shrink-0 place-items-center">
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
        <span className="secret text-muted-foreground text-sm">{row.count}</span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      </button>
    </li>
  );
}

export function VaultOverview({
  onSelect,
  folders,
  totalCount,
  totpCount,
  typeCounts,
  folderCounts,
  unfiledCount,
  trashCount,
  onNewFolder,
}: VaultOverviewProps) {
  const quick: Row[] = [
    { key: "all", label: "All items", count: totalCount, filter: { kind: "all" }, Icon: LayoutGrid },
  ];
  // Only offered when there is something to show: an always-present row reading
  // zero is noise on a screen whose whole job is orientation.
  if (totpCount > 0) {
    quick.push({
      key: "totp",
      label: "Verification codes",
      count: totpCount,
      filter: { kind: "totp" },
      Icon: Clock,
    });
  }

  const types: Row[] = TYPE_ROWS.map(({ type, label, Icon }) => ({
    key: `type:${type}`,
    label,
    count: typeCounts.get(type) ?? 0,
    filter: { kind: "type", type },
    Icon,
  }));

  const folderRows: Row[] = [
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
  ];

  return (
    <div className="grid gap-6">
      <Section title="VAULT" count={quick.length}>
        {quick.map((row) => (
          <OverviewRow key={row.key} row={row} onSelect={() => onSelect(row.filter)} />
        ))}
      </Section>

      <Section title="TYPES" count={types.length}>
        {types.map((row) => (
          <OverviewRow key={row.key} row={row} onSelect={() => onSelect(row.filter)} />
        ))}
      </Section>

      <Section
        title="FOLDERS"
        count={folders.length}
        action={
          <Button variant="ghost" size="icon-xs" onClick={onNewFolder} aria-label="New folder">
            <FolderPlus />
          </Button>
        }
      >
        {folderRows.map((row) => (
          <OverviewRow key={row.key} row={row} onSelect={() => onSelect(row.filter)} />
        ))}
      </Section>

      <Section title="TRASH" count={trashCount}>
        <OverviewRow
          row={{
            key: "trash",
            label: "Deleted items",
            count: trashCount,
            filter: { kind: "trash" },
            Icon: Trash2,
          }}
          onSelect={() => onSelect({ kind: "trash" })}
        />
      </Section>
    </div>
  );
}
