import { describe, expect, it } from "vitest";

import { anyUriMatches, matchesUri, registrableDomain } from "./uri";
import type { UriEntry } from "./schema";

const entry = (uri: string, match: UriEntry["match"] = "domain"): UriEntry => ({
  uri,
  match,
});

describe("registrableDomain", () => {
  it("keeps tenants on a shared host apart", () => {
    // The trap: with allowPrivateDomains off, github.io reads as an ordinary
    // domain and every user's page becomes "the same site" as every other's.
    expect(registrableDomain("alice.github.io")).toBe("alice.github.io");
    expect(registrableDomain("bob.github.io")).toBe("bob.github.io");
    expect(registrableDomain("alice.github.io")).not.toBe(
      registrableDomain("bob.github.io"),
    );
  });

  it("still collapses ordinary subdomains", () => {
    expect(registrableDomain("accounts.google.com")).toBe("google.com");
    expect(registrableDomain("mail.google.com")).toBe("google.com");
  });

  it("returns null for something that is not a host", () => {
    expect(registrableDomain("localhost")).toBeNull();
  });
});

describe("domain matching", () => {
  it("matches across subdomains of one registrable domain", () => {
    expect(matchesUri(entry("https://google.com"), "https://accounts.google.com/x")).toBe(true);
  });

  it("does not match a different domain", () => {
    expect(matchesUri(entry("https://google.com"), "https://google.evil.com/")).toBe(false);
  });

  it("accepts a saved address with no scheme", () => {
    // People type "github.com" into the field, not "https://github.com".
    expect(matchesUri(entry("github.com"), "https://github.com/login")).toBe(true);
  });
});

describe("host matching", () => {
  it("requires the same host", () => {
    expect(matchesUri(entry("https://a.example.com", "host"), "https://a.example.com/x")).toBe(true);
    expect(matchesUri(entry("https://a.example.com", "host"), "https://b.example.com/x")).toBe(false);
  });

  it("treats a different port as a different host", () => {
    // Two services on one machine are two services.
    expect(matchesUri(entry("http://localhost:3000", "host"), "http://localhost:3000/a")).toBe(true);
    expect(matchesUri(entry("http://localhost:3000", "host"), "http://localhost:4000/a")).toBe(false);
  });
});

describe("startsWith matching", () => {
  it("matches a prefix of the whole url", () => {
    const e = entry("https://example.com/admin", "startsWith");
    expect(matchesUri(e, "https://example.com/admin/users")).toBe(true);
    expect(matchesUri(e, "https://example.com/public")).toBe(false);
  });
});

describe("exact matching", () => {
  it("requires the whole url, character for character", () => {
    const e = entry("https://example.com/login", "exact");
    expect(matchesUri(e, "https://example.com/login")).toBe(true);
    expect(matchesUri(e, "https://example.com/login?next=/")).toBe(false);
  });
});

describe("regex matching", () => {
  it("matches a valid pattern", () => {
    const e = entry("^https://example\\.(com|co\\.uk)/", "regex");
    expect(matchesUri(e, "https://example.com/login")).toBe(true);
    expect(matchesUri(e, "https://example.co.uk/login")).toBe(true);
    expect(matchesUri(e, "https://example.org/login")).toBe(false);
  });

  it("fails closed on an invalid pattern", () => {
    // A broken regex must not become a wildcard. This is the difference
    // between offering nothing and offering everything to everyone.
    expect(matchesUri(entry("([", "regex"), "https://example.com")).toBe(false);
  });
});

describe("never", () => {
  it("never matches, even its own address", () => {
    expect(matchesUri(entry("https://example.com", "never"), "https://example.com")).toBe(false);
  });
});

describe("failing closed", () => {
  it("rejects an unparseable page url", () => {
    expect(matchesUri(entry("https://example.com"), "not a url")).toBe(false);
  });

  it("rejects an empty saved address", () => {
    expect(matchesUri(entry(""), "https://example.com")).toBe(false);
    expect(matchesUri(entry("   "), "https://example.com")).toBe(false);
  });
});

describe("anyUriMatches", () => {
  it("is true when one of several applies", () => {
    const entries = [entry("https://other.com"), entry("https://example.com")];
    expect(anyUriMatches(entries, "https://example.com/login")).toBe(true);
  });

  it("silences only the entry marked never, not the item", () => {
    const entries = [
      entry("https://example.com", "never"),
      entry("https://example.com", "domain"),
    ];
    expect(anyUriMatches(entries, "https://example.com/login")).toBe(true);
  });

  it("is false for an empty list", () => {
    expect(anyUriMatches([], "https://example.com")).toBe(false);
  });
});
