"use client";

import { CreditCard, KeyRound, StickyNote } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@passio/ui/alert";
import { ItemRowActions } from "./item-row-actions";
import type { DecryptedItem } from "@passio/core/decrypt-vault";
import { routes, useNavigation } from "./navigation";
import type { ItemType } from "@passio/core/schema";

const TYPE_ICON: Record<ItemType, typeof KeyRound> = {
  login: KeyRound,
  note: StickyNote,
  card: CreditCard,
};

function subtitle(item: DecryptedItem): string {
  const data = item.data;
  if (data.type === "login") return data.username ?? data.uri ?? "No username";
  if (data.type === "card") return data.cardholderName ?? "Card";
  return "Secure note";
}

interface ItemListProps {
  items: DecryptedItem[];
  /** Ids that failed to decrypt. Surfaced, never silently hidden. */
  damaged: string[];
  query: string;
  /** Present only in trash: rows offer restore instead of the usual actions. */
  onRestore?: (item: DecryptedItem) => void;
  onDelete?: (item: DecryptedItem) => void;
  emptyMessage?: string;
}

export function ItemList({
  items,
  damaged,
  query,
  onRestore,
  onDelete,
  emptyMessage,
}: ItemListProps) {
  const { Link } = useNavigation();

  return (
    <div className="grid gap-4">
      {damaged.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>
            {damaged.length === 1
              ? "1 item could not be decrypted"
              : `${damaged.length} items could not be decrypted`}
          </AlertTitle>
          <AlertDescription>
            They are still stored, so nothing has been lost. This usually means the
            stored data was altered.
          </AlertDescription>
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {query.trim().length > 0
            ? `Nothing matches “${query}”.`
            : (emptyMessage ?? "Nothing saved yet.")}
        </p>
      ) : (
        <ul className="divide-border bg-card divide-y overflow-hidden rounded-xl border">
          {items.map((item) => {
            const Icon = TYPE_ICON[item.data.type];
            return (
              <li
                key={item.id}
                className="hover:bg-muted/40 flex items-center gap-2 pr-2 transition-colors"
              >
                {/* The link covers the text only. The action buttons beside it
                    must not be nested inside an anchor. */}
                <Link
                  href={routes.item(item.id)}
                  className="focus-visible:bg-muted/60 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-3 outline-none"
                >
                  <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                    <Icon className="size-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.data.title}
                    </span>
                    {/* Never a password: the list is the most
                        over-the-shoulder-visible surface in the app. */}
                    <span className="text-muted-foreground block truncate text-xs">
                      {subtitle(item)}
                    </span>
                  </span>
                </Link>

                <ItemRowActions
                  item={item}
                  onRestore={onRestore ? () => onRestore(item) : undefined}
                  onDelete={onDelete ? () => onDelete(item) : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
