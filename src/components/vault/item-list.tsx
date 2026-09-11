"use client";

import Link from "next/link";

import type { DecryptedItem } from "~/lib/items/decrypt-vault";
import type { ItemType } from "~/lib/items/schema";

/** A word, not an icon: three types do not justify an icon vocabulary to learn. */
const TYPE_LABEL: Record<ItemType, string> = {
  login: "Login",
  note: "Note",
  card: "Card",
};

function subtitle(item: DecryptedItem): string {
  const data = item.data;
  if (data.type === "login") return data.username ?? data.uri ?? "";
  if (data.type === "card") return data.cardholderName ?? "";
  return "";
}

interface ItemListProps {
  items: DecryptedItem[];
  /** Ids that failed to decrypt. Surfaced, never silently hidden. */
  damaged: string[];
  query: string;
}

export function ItemList({ items, damaged, query }: ItemListProps) {
  if (items.length === 0) {
    return (
      <p className="py-10 text-[var(--muted)]">
        {query.trim().length > 0
          ? `Nothing matches “${query}”.`
          : "Nothing saved yet. Items you add are encrypted on this device before they are stored."}
      </p>
    );
  }

  return (
    <>
      {damaged.length > 0 ? (
        <p
          role="alert"
          className="mb-4 rounded-[5px] border border-[var(--danger)] bg-[var(--danger-surface)] px-4 py-3 text-sm"
        >
          {damaged.length === 1
            ? "1 item could not be decrypted and is not shown. It is still stored, so nothing has been lost."
            : `${damaged.length} items could not be decrypted and are not shown. They are still stored, so nothing has been lost.`}
        </p>
      ) : null}

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/vault/${item.id}`}
              className="hairline flex items-baseline gap-4 py-3 hover:bg-[var(--surface)]"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.data.title}
              </span>
              {/* Never a password: the list is the most over-the-shoulder-visible
                  surface in the app. */}
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">
                {subtitle(item)}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {TYPE_LABEL[item.data.type]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
