import { parse } from "tldts";

export interface MatchableItem {
  id: string;
  uri?: string;
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
    if (!item.uri) continue;
    const url = toUrl(item.uri);
    if (!url) continue;

    if (url.hostname === page.hostname) {
      scored.push({ item, rank: 0 });
      continue;
    }

    const itemDomain = registrable(url.hostname);
    if (itemDomain && pageDomain && itemDomain === pageDomain) {
      scored.push({ item, rank: 1 });
    }
  }

  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.item);
}
