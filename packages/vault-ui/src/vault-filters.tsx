"use client";

import { Folder, Shapes, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@passio/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@passio/ui/select";
import { cn } from "@passio/ui/cn";
import type { DecryptedFolder } from "@passio/core/decrypt-folders";
import {
  ANY,
  NO_FOLDER,
  type FilterCounts,
  type TypeChoice,
  type VaultScope,
} from "@passio/core/filter";
import type { ItemType } from "@passio/core/schema";

interface VaultFiltersProps {
  scope: VaultScope;
  onScopeChange: (scope: VaultScope) => void;
  folders: DecryptedFolder[];
  counts: FilterCounts;
  /** Trash is a web-app and vault-window view. Omitted, it is not offered. */
  trashCount?: number;
  className?: string;
}

const TYPES: Array<{ value: TypeChoice; label: string }> = [
  { value: "login", label: "Logins" },
  { value: "note", label: "Notes" },
  { value: "card", label: "Cards" },
];

/**
 * A choice, with how many are behind it.
 *
 * The count sits in the menu and never on the trigger. On the trigger it made
 * a control that changes width when you use it; here it is information at the
 * moment you actually need it - when you are deciding which way to go.
 */
function Choice({ value, label, count }: { value: string; label: string; count?: number }) {
  return (
    <SelectItem value={value}>
      <span className="min-w-0 flex-1 truncate pr-6">{label}</span>
      {count !== undefined ? (
        <span className="secret text-muted-foreground text-[11px]">{count}</span>
      ) : null}
    </SelectItem>
  );
}

/**
 * The two questions worth asking about a vault: which folder, and what kind.
 *
 * Two controls side by side, each taking half the row, which is the layout
 * every vault worth copying has landed on - and the reason is width, not
 * taste. A row of pills has to grow with the number of categories and the
 * length of their names; two dropdowns do not. Inside a 400px popup that is
 * the difference between a control that fits and one that pushes the search
 * field out of the window.
 *
 * What makes it ours is the shape language and the state. Stadium, because in
 * this interface a stadium is a scope, a circle is an identity and a rounded
 * rectangle is an action. And a control that is narrowing something wears the
 * accent, so being filtered is visible without reading either label - the
 * thing that actually bites you is forgetting a filter is on.
 *
 * The two axes are independent on purpose, so "my work cards" is askable. See
 * VaultScope in @passio/core/filter.
 */
export function VaultFilters({
  scope,
  onScopeChange,
  folders,
  counts,
  trashCount,
  className,
}: VaultFiltersProps) {
  // Base UI renders the raw value unless the root is told how to label it,
  // which is what once showed a bare uuid in the item form.
  const folderLabels = useMemo(() => {
    const labels: Record<string, string> = {
      [ANY]: "All folders",
      [NO_FOLDER]: "No folder",
    };
    for (const folder of folders) labels[folder.id] = folder.name;
    return labels;
  }, [folders]);

  const typeLabels: Record<string, string> = {
    [ANY]: "All types",
    login: "Logins",
    note: "Notes",
    card: "Cards",
    totp: "Verification codes",
  };

  const folderNarrowed = scope.folder !== ANY;
  const typeNarrowed = scope.type !== ANY;

  /** Stadium, half the row, and accented while it is hiding something. */
  const trigger = (narrowed: boolean) =>
    cn(
      "h-9 w-full min-w-0 rounded-full border-0 px-3.5 text-[13px]",
      narrowed
        ? "bg-accent text-accent-foreground font-medium hover:bg-accent"
        : "bg-muted text-muted-foreground hover:text-foreground",
    );

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Select
        items={folderLabels}
        value={scope.folder}
        onValueChange={(next: string | null) =>
          onScopeChange({ ...scope, folder: next ?? ANY })
        }
      >
        <SelectTrigger aria-label="Filter by folder" className={trigger(folderNarrowed)}>
          <Folder className="size-3.5 shrink-0 opacity-70" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <Choice value={ANY} label="All folders" count={counts.total} />
          {folders.map((folder) => (
            <Choice
              key={folder.id}
              value={folder.id}
              label={folder.name}
              count={counts.byFolder.get(folder.id) ?? 0}
            />
          ))}
          <Choice value={NO_FOLDER} label="No folder" count={counts.unfiled} />
        </SelectContent>
      </Select>

      <Select
        items={typeLabels}
        value={scope.type}
        onValueChange={(next: string | null) =>
          onScopeChange({ ...scope, type: (next as TypeChoice | null) ?? ANY })
        }
      >
        <SelectTrigger aria-label="Filter by type" className={trigger(typeNarrowed)}>
          <Shapes className="size-3.5 shrink-0 opacity-70" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <Choice value={ANY} label="All types" count={counts.total} />
          {TYPES.map(({ value, label }) => (
            <Choice
              key={value}
              value={value}
              label={label}
              count={counts.byType.get(value as ItemType) ?? 0}
            />
          ))}
          {/* Offered only when there is something to show. A row reading zero
              is dead weight for anyone with no authenticator secrets. */}
          {counts.totp > 0 ? (
            <Choice value="totp" label="Verification codes" count={counts.totp} />
          ) : null}
        </SelectContent>
      </Select>

      {trashCount !== undefined ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Trash, ${trashCount} ${trashCount === 1 ? "item" : "items"}`}
          aria-pressed={scope.trash}
          onClick={() => onScopeChange({ ...scope, trash: !scope.trash })}
          className={cn(
            "size-9 shrink-0 rounded-full",
            scope.trash
              ? "bg-accent text-accent-foreground hover:bg-accent"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
}
