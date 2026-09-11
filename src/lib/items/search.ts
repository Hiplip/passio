import type { DecryptedItem } from "./decrypt-vault";

/**
 * Builds the text a query is matched against.
 *
 * Only the fields a person would actually search by: title, username, uri.
 *
 * Passwords, note bodies, card numbers, CVVs and TOTP secrets are deliberately
 * excluded. Matching on a secret would turn the search box into an oracle -
 * anyone at an unlocked screen could confirm a guessed password by typing it in
 * and seeing whether a result appeared.
 */
function haystack(item: DecryptedItem): string {
  const data = item.data as Record<string, unknown>;
  return [data.title, data.username, data.uri]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

/** Runs entirely in memory over the already-decrypted vault; the server never
 *  sees a query. */
export function searchItems(items: DecryptedItem[], query: string): DecryptedItem[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return items;
  return items.filter((item) => haystack(item).includes(needle));
}
