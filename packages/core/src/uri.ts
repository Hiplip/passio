import { parse } from "tldts";

import type { UriEntry } from "./schema";

/**
 * Whether a saved address applies to the page you are on.
 *
 * Extracted from `match.ts` so the six modes can be tested one at a time. The
 * rules follow Bitwarden's, because users arriving from there carry expectations
 * with them and a mode that meant something subtly different would silently
 * offer the wrong credential.
 *
 * Every mode fails CLOSED. An unparseable saved address, a broken regex, or a
 * page URL that is not a URL all return false - offering nothing is a
 * inconvenience, offering the wrong login to the wrong site is a breach.
 */

/**
 * The registrable domain, via the Public Suffix List.
 *
 * `allowPrivateDomains` is NOT the default, and the default is wrong for us:
 * with it off, `github.io` and `vercel.app` read as ordinary domains, so
 * `alice.github.io` and `bob.github.io` become "the same site" and one tenant's
 * login is offered on another tenant's page.
 */
export function registrableDomain(host: string): string | null {
  return parse(host, { allowPrivateDomains: true }).domain;
}

function url(value: string): URL | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    return new URL(trimmed);
  } catch {
    // A saved address is often typed by hand and missing its scheme.
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

export function matchesUri(entry: UriEntry, pageUrl: string): boolean {
  if (entry.match === "never") return false;

  const page = url(pageUrl);
  if (!page) return false;

  if (entry.match === "regex") {
    try {
      // Anchored nowhere on purpose: Bitwarden treats these as unanchored, and
      // a user writing `^https://example\.com` expects it to work.
      return new RegExp(entry.uri).test(pageUrl);
    } catch {
      // An invalid pattern must not match everything.
      return false;
    }
  }

  const saved = url(entry.uri);
  if (!saved) return false;

  switch (entry.match) {
    case "domain": {
      const a = registrableDomain(saved.hostname);
      const b = registrableDomain(page.hostname);
      return a !== null && b !== null && a === b;
    }
    case "host":
      // Host includes the port, which is what distinguishes two services on
      // one machine.
      return saved.host === page.host;
    case "startsWith":
      return pageUrl.startsWith(entry.uri);
    case "exact":
      return pageUrl === entry.uri;
  }
}

/** True when any of an item's addresses applies. An explicit `never` on one
 *  entry only silences that entry, not the whole item. */
export function anyUriMatches(entries: UriEntry[], pageUrl: string): boolean {
  return entries.some((entry) => matchesUri(entry, pageUrl));
}
