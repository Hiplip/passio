import type { DecryptedItem } from "./decrypt-vault";

/** The fields a query is matched against, in either shape they arrive in. */
export interface Searchable {
  title?: unknown;
  username?: unknown;
  uri?: unknown;
}

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
function haystack(value: Searchable): string {
  return [value.title, value.username, value.uri]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
}

function match<T>(items: T[], query: string, of: (item: T) => Searchable): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return items;
  return items.filter((item) => haystack(of(item)).includes(needle));
}

/** Runs entirely in memory over the already-decrypted vault; the server never
 *  sees a query. */
export function searchItems(items: DecryptedItem[], query: string): DecryptedItem[] {
  return match(items, query, (i) => i.data as Searchable);
}

/**
 * The same search over the extension's flat `ItemSummary` shape.
 *
 * Shares `haystack` with `searchItems` rather than reimplementing it, so the
 * two clients can never drift into searching different fields - and in
 * particular so neither can start matching on a secret.
 */
export function searchSummaries<T extends Searchable>(items: T[], query: string): T[] {
  return match(items, query, (i) => i);
}
