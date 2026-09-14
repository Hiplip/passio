"use client";

import { Alert, AlertDescription, AlertTitle } from "@passio/ui/alert";
import { ItemMark } from "./item-mark";
import { ItemRowActions } from "./item-row-actions";
import type { DecryptedItem } from "@passio/core/decrypt-vault";
import { routes, useNavigation } from "./navigation";

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
  /** Shown in place of the list when there is nothing to show. */
  empty: React.ReactNode;
  /** Present only in trash: rows offer restore instead of the usual actions. */
  onRestore?: (item: DecryptedItem) => void;
  onDelete?: (item: DecryptedItem) => void;
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
                  <span className="block truncate font-medium">{item.data.title}</span>
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
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
