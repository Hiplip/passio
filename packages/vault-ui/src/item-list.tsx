"use client";

import { Star } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@passio/ui/alert";
import { ItemMark } from "./item-mark";
import { ItemRowActions } from "./item-row-actions";
import type { DecryptedItem } from "@passio/core/decrypt-vault";
import { TYPE_SPECS } from "@passio/core/fields";
import { urisOf } from "@passio/core/schema";
import { routes, useNavigation } from "./navigation";

/**
 * The line under an item's name.
 *
 * Never a secret: the list is the most over-the-shoulder-visible surface in the
 * app, so this falls back to the type's own name rather than reaching for the
 * first field it can find.
 */
function subtitle(item: DecryptedItem): string {
  const data = item.data;
  if (data.type === "login") {
    return data.username ?? urisOf(data)[0]?.uri ?? "No username";
  }
  if (data.type === "card") return data.cardholderName ?? "Card";
  if (data.type === "identity") {
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
    return name.length > 0 ? name : TYPE_SPECS.identity.label;
  }
  return TYPE_SPECS[data.type].label;
}

interface ItemListProps {
  items: DecryptedItem[];
  /** Ids that failed to decrypt. Surfaced, never silently hidden. */
  damaged: string[];
  /** Shown in place of the list when there is nothing to show. */
  empty: React.ReactNode;
  /** Present only in trash: rows offer restore instead of the usual actions. */
  onRestore?: (item: DecryptedItem) => void;
  onDelete?: (item: DecryptedItem) => void;
  onToggleFavourite?: (item: DecryptedItem) => void;
}

/**
 * The vault, as a list.
 *
 * No card, no shadow, no outer border: the list is the page, and wrapping it
 * in a panel would only announce that fact a second time. Rows are separated
 * by hairlines and told apart by their marks.
 */
export function ItemList({
  items,
  damaged,
  empty,
  onRestore,
  onDelete,
  onToggleFavourite,
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
        empty
      ) : (
        <ul className="rows border-border border-y">
          {items.map((item) => (
            <li
              key={item.id}
              className="hover:bg-muted/50 group/item flex items-center gap-1 pr-2 transition-colors"
            >
              {/* The link covers the text only. The action buttons beside it
                  must not be nested inside an anchor. */}
              <Link
                href={routes.item(item.id)}
                className="focus-visible:bg-muted flex min-w-0 flex-1 items-center gap-3.5 rounded-md py-2.5 pl-2 outline-none"
              >
                <ItemMark name={item.data.title} type={item.data.type} />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{item.data.title}</span>
                    {item.data.favourite ? (
                      <Star
                        className="text-cipher size-3 shrink-0 fill-current"
                        aria-label="Favourite"
                      />
                    ) : null}
                  </span>
                  {/* Never a password: the list is the most
                      over-the-shoulder-visible surface in the app. */}
                  <span className="text-muted-foreground block truncate text-[13px]">
                    {subtitle(item)}
                  </span>
                </span>
              </Link>

              <ItemRowActions
                item={item}
                onRestore={onRestore ? () => onRestore(item) : undefined}
                onDelete={onDelete ? () => onDelete(item) : undefined}
                onToggleFavourite={
                  onToggleFavourite ? () => onToggleFavourite(item) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
