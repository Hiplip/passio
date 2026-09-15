import { describe, expect, it } from "vitest";

import { matchItemsToUrl, type MatchableItem } from "./match";

const item = (id: string, uri?: string): MatchableItem => ({ id, uri });
const ids = (r: MatchableItem[]) => r.map((i) => i.id);

describe("matchItemsToUrl", () => {
  it("matches an exact host", () => {
    expect(ids(matchItemsToUrl(
      [item("a", "https://github.com/login")], "https://github.com/settings",
    ))).toEqual(["a"]);
  });

  it("matches across subdomains of one registrable domain", () => {
    expect(ids(matchItemsToUrl(
      [item("a", "https://accounts.google.com/signin")], "https://mail.google.com/",
    ))).toEqual(["a"]);
  });

  it("ranks an exact host above a base-domain match", () => {
    const items = [
      item("base", "https://google.com/"),
      item("exact", "https://mail.google.com/"),
    ];
    expect(ids(matchItemsToUrl(items, "https://mail.google.com/")))
      .toEqual(["exact", "base"]);
  });

  it("keeps user-controlled subdomains apart", () => {
    // github.io is itself a public suffix, so alice and bob are different
    // sites. A naive last-two-labels rule would offer alice's login on a page
    // bob controls.
    expect(matchItemsToUrl(
      [item("alice", "https://alice.github.io/app")], "https://bob.github.io/app",
    )).toEqual([]);
  });

  it("keeps vercel.app subdomains apart", () => {
    expect(matchItemsToUrl(
      [item("mine", "https://passio-hiplip.vercel.app/login")],
      "https://someone-else.vercel.app/",
    )).toEqual([]);
  });

  it("handles multi-part suffixes", () => {
    const items = [item("a", "https://www.bbc.co.uk/login")];
    expect(ids(matchItemsToUrl(items, "https://news.bbc.co.uk/"))).toEqual(["a"]);
    expect(matchItemsToUrl(items, "https://other.co.uk/")).toEqual([]);
  });

  it("ignores items with no uri", () => {
    expect(matchItemsToUrl([item("a")], "https://github.com/")).toEqual([]);
  });

  it("refuses non-http schemes on either side", () => {
    expect(matchItemsToUrl(
      [item("a", "javascript:alert(1)")], "https://x.com/",
    )).toEqual([]);
    expect(matchItemsToUrl(
      [item("a", "https://x.com/")], "chrome://extensions",
    )).toEqual([]);
    expect(matchItemsToUrl(
      [item("a", "https://x.com/")], "file:///tmp/x.html",
    )).toEqual([]);
  });

  it("tolerates a stored uri with no scheme", () => {
    // People type "github.com" into a URI field constantly.
    expect(ids(matchItemsToUrl(
      [item("a", "github.com")], "https://github.com/",
    ))).toEqual(["a"]);
  });

  it("returns nothing for junk rather than throwing", () => {
    expect(matchItemsToUrl([item("a", "https://x.com/")], "not a url")).toEqual([]);
    expect(matchItemsToUrl([item("a", ":::")], "https://x.com/")).toEqual([]);
    expect(matchItemsToUrl([item("a", "  ")], "https://x.com/")).toEqual([]);
  });

  it("matches an ip address host exactly and not by domain", () => {
    expect(ids(matchItemsToUrl(
      [item("a", "http://127.0.0.1:3000/")], "http://127.0.0.1:3000/login",
    ))).toEqual(["a"]);
  });
});

describe("explicit match modes", () => {
  it("offers an item whose regex matches, with no legacy uri at all", () => {
    const items = [
      { id: "a", uris: [{ uri: "^https://example\\.(com|co\\.uk)/", match: "regex" as const }] },
    ];
    expect(matchItemsToUrl(items, "https://example.co.uk/login").map((i) => i.id)).toEqual(["a"]);
    expect(matchItemsToUrl(items, "https://other.com/login")).toEqual([]);
  });

  it("ranks an explicit mode ahead of a domain match", () => {
    // Someone who wrote an exact URL meant that page specifically, so it should
    // come before a login saved for the whole domain.
    const items = [
      { id: "broad", uri: "https://example.com" },
      { id: "exact", uris: [{ uri: "https://example.com/admin", match: "exact" as const }] },
    ];
    expect(matchItemsToUrl(items, "https://example.com/admin").map((i) => i.id)).toEqual([
      "exact",
      "broad",
    ]);
  });

  it("honours never on the entry without silencing a second entry", () => {
    const items = [
      {
        id: "a",
        uris: [
          { uri: "https://example.com", match: "never" as const },
          { uri: "https://example.com", match: "domain" as const },
        ],
      },
    ];
    expect(matchItemsToUrl(items, "https://example.com/x").map((i) => i.id)).toEqual(["a"]);
  });

  it("offers nothing when the only entry is never", () => {
    const items = [
      { id: "a", uris: [{ uri: "https://example.com", match: "never" as const }] },
    ];
    expect(matchItemsToUrl(items, "https://example.com/x")).toEqual([]);
  });

  it("still matches an item that only has the legacy uri", () => {
    // Existing vaults were written before `uris` existed and cannot be migrated
    // server-side, so this path has to keep working indefinitely.
    const items = [{ id: "old", uri: "https://example.com" }];
    expect(matchItemsToUrl(items, "https://www.example.com/login").map((i) => i.id)).toEqual(["old"]);
  });

  it("prefers an exact host over a sibling subdomain", () => {
    const items = [
      { id: "root", uris: [{ uri: "https://google.com", match: "domain" as const }] },
      { id: "mail", uris: [{ uri: "https://mail.google.com", match: "domain" as const }] },
    ];
    expect(matchItemsToUrl(items, "https://mail.google.com/inbox").map((i) => i.id)).toEqual([
      "mail",
      "root",
    ]);
  });
});
