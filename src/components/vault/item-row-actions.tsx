"use client";

import { Copy, ExternalLink, MoreVertical, RotateCcw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { copyWithAutoClear } from "~/lib/clipboard";
import { copyActionsFor, launchUrlFor } from "~/lib/items/actions";
import type { DecryptedItem } from "~/lib/items/decrypt-vault";

interface ItemRowActionsProps {
  item: DecryptedItem;
  /** Present only in trash: the row offers restore instead of the usual actions. */
  onRestore?: () => void;
  onDelete?: () => void;
}

async function copy(label: string, value: string) {
  if (await copyWithAutoClear(value)) {
    toast.success(`${label.replace(/^Copy /, "")} copied`.replace(/^./, (c) => c.toUpperCase()), {
      description: "Your clipboard clears in 30 seconds.",
    });
  } else {
    toast.error("Could not copy", { description: "Your browser blocked clipboard access." });
  }
}

export function ItemRowActions({ item, onRestore, onDelete }: ItemRowActionsProps) {
  // Resolved on open rather than on render, so a one-time code is always the
  // current one.
  const actions = () => copyActionsFor(item.data);
  const url = launchUrlFor(item.data);

  if (onRestore) {
    return (
      <Button variant="outline" size="sm" onClick={onRestore}>
        <RotateCcw />
        Restore
      </Button>
    );
  }

  const copyItems = actions().map((action) => (
    <DropdownMenuItem
      key={action.key}
      className="whitespace-nowrap"
      onClick={() => void copy(action.label, action.value)}
    >
      {action.label}
    </DropdownMenuItem>
  ));

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {/* Quick actions, desktop only. On a phone everything lives behind the
          one menu, because three tap targets in a row is a mis-tap waiting to
          happen on a screen this narrow. */}
      {url ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden sm:inline-flex"
          render={
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open website" />
          }
        >
          <ExternalLink />
        </Button>
      ) : null}

      {copyItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden sm:inline-flex"
                aria-label={`Copy from ${item.data.title}`}
              />
            }
          >
            <Copy />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{copyItems}</DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${item.data.title}`}
            />
          }
        >
          <MoreVertical />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          {/* On a phone this menu is the only way to reach these, so the copy
              actions and the website appear here too. */}
          <div className="sm:hidden">
            {copyItems}
            {url ? (
              <DropdownMenuItem
                className="whitespace-nowrap"
                render={<a href={url} target="_blank" rel="noopener noreferrer" />}
              >
                Open website
              </DropdownMenuItem>
            ) : null}
            {copyItems.length > 0 || url ? <DropdownMenuSeparator /> : null}
          </div>

          <DropdownMenuItem
            className="whitespace-nowrap"
            render={<Link href={`/vault/${item.id}`} />}
          >
            Edit
          </DropdownMenuItem>

          {onDelete ? (
            <DropdownMenuItem
              variant="destructive"
              className="whitespace-nowrap"
              onClick={onDelete}
            >
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
