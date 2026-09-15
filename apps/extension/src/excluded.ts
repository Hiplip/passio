import { registrableDomain } from "@passio/core/uri";

/**
 * Sites passio stays away from entirely.
 *
 * No suggestion button, no overlay, no fill, no badge. There are pages where an
 * extension has no business appearing - a bank that flags injected script, a
 * kiosk, an internal tool - and "turn the whole feature off" is too blunt an
 * answer.
 *
 * Matched on the registrable domain, so excluding `example.com` covers every
 * subdomain. That is the behaviour people expect and the one that fails safe:
 * over-excluding costs a convenience, under-excluding puts the extension
 * somewhere it was told not to go.
 */

export const EXCLUDED_KEY = "passio.excluded";

/** Storage, narrowed to what this module uses, so it can be tested. */
export interface ExcludedStore {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

/** Normalises anything a person might type into a comparable domain. */
export function normaliseDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const { hostname } = new URL(withScheme);
    // Fall back to the bare hostname for things the public suffix list does not
    // recognise - localhost, an intranet name, an IP address.
    return registrableDomain(hostname) ?? hostname;
  } catch {
    return null;
  }
}

export async function readExcluded(store: ExcludedStore): Promise<string[]> {
  const stored = await store.get(EXCLUDED_KEY);
  const value = stored[EXCLUDED_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function addExcluded(
  store: ExcludedStore,
  input: string,
): Promise<string[]> {
  const domain = normaliseDomain(input);
  if (!domain) return readExcluded(store);

  const current = await readExcluded(store);
  if (current.includes(domain)) return current;

  const next = [...current, domain].sort();
  await store.set({ [EXCLUDED_KEY]: next });
  return next;
}

export async function removeExcluded(
  store: ExcludedStore,
  domain: string,
): Promise<string[]> {
  const current = await readExcluded(store);
  const next = current.filter((entry) => entry !== domain);
  await store.set({ [EXCLUDED_KEY]: next });
  return next;
}

/**
 * Whether passio should stay out of this page.
 *
 * Fails CLOSED in the sense that matters here: a URL that cannot be parsed is
 * treated as excluded, because a page we cannot identify is a page we should
 * not be injecting into.
 */
export function isExcluded(pageUrl: string, excluded: readonly string[]): boolean {
  if (excluded.length === 0) return false;

  const domain = normaliseDomain(pageUrl);
  if (!domain) return true;

  return excluded.includes(domain);
}
