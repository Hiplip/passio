"use client";

import { ChevronRight, CreditCard, KeyRound, StickyNote } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import type { DecryptedItem } from "~/lib/items/decrypt-vault";
import type { ItemType } from "~/lib/items/schema";

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
}

export function ItemList({ items, damaged, query }: ItemListProps) {
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
            : "Nothing saved yet."}
        </p>
      ) : (
        <ul className="divide-border bg-card divide-y overflow-hidden rounded-xl border">
          {items.map((item) => {
            const Icon = TYPE_ICON[item.data.type];
            return (
              <li key={item.id}>
                <Link
                  href={`/vault/${item.id}`}
                  className="hover:bg-muted/60 focus-visible:bg-muted/60 flex items-center gap-3 px-4 py-3 transition-colors outline-none"
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

                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
