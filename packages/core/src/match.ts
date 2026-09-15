import { parse } from "tldts";

import type { UriEntry } from "./schema";
import { matchesUri } from "./uri";

export interface MatchableItem {
  id: string;
  /** Legacy single address. Still honoured so existing items keep matching. */
  uri?: string;
  /** Addresses with explicit match modes. Preferred when present. */
  uris?: UriEntry[];
}

/**
 * http(s) only.
 *
 * A stored `javascript:` URI is a stored XSS payload, and this is one of the
 * two places that decides whether it ever gets used - `launchUrlFor` is the
 * other.
 */
function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    // A bare "github.com" is what people actually type into a URI field.
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The registrable domain, via the public suffix list.
 *
 * The PSL is the entire point. A "last two labels" rule makes alice.github.io
 * and bob.github.io the same site, so one person's login gets offered on a page
 * the other controls. The list knows github.io - and vercel.app, which this
 * project deploys to - are public suffixes in their own right.
 */
function registrable(host: string): string | null {
  // allowPrivateDomains is NOT the default, and the default is wrong for us.
  // The PSL has an ICANN section and a PRIVATE section; github.io, vercel.app,
  // pages.dev and friends live in the private one. With it off, tldts reports
  // the registrable domain of alice.github.io as "github.io" - so alice's
  // login would be offered on bob.github.io, a page bob controls.
  return parse(host, { allowPrivateDomains: true }).domain;
}

/**
 * How well one item fits the page, or null for not at all.
 *
 * Lower is better. An exact host beats a registrable-domain match, and an
 * explicit non-domain match mode beats both - a user who wrote a regex or an
 * exact URL meant that one specifically.
 */
function rankOf(
  item: MatchableItem,
  page: URL,
  pageDomain: string | null,
  pageUrl: string,
): number | null {
  const explicit = item.uris ?? [];

  // An entry marked `never` silences that address only, so a second entry can
  // still match. Ranked ahead of the legacy path because it was set on purpose.
  for (const entry of explicit) {
    if (entry.match !== "domain" && matchesUri(entry, pageUrl)) return 0;
  }

  const addresses = [
    ...explicit.filter((e) => e.match === "domain").map((e) => e.uri),
    ...(item.uri ? [item.uri] : []),
  ];

  let best: number | null = null;
  for (const address of addresses) {
    const url = toUrl(address);
    if (!url) continue;

    if (url.hostname === page.hostname) return 1;

    const itemDomain = registrable(url.hostname);
    if (itemDomain && pageDomain && itemDomain === pageDomain) best = 2;
  }

  return best;
}

/**
 * The vault items that belong to a page, best match first.
 *
 * An exact host beats a registrable-domain match, so a login saved for
 * mail.google.com is offered ahead of one saved for google.com when you are
 * actually on mail.
 */
export function matchItemsToUrl<T extends MatchableItem>(
  items: T[],
  pageUrl: string,
): T[] {
  const page = toUrl(pageUrl);
  if (!page) return [];

  const pageDomain = registrable(page.hostname);
  const scored: Array<{ item: T; rank: number }> = [];

  for (const item of items) {
    const rank = rankOf(item, page, pageDomain, pageUrl);
    if (rank !== null) scored.push({ item, rank });
  }

  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.item);
}
