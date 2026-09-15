import { describe, expect, it } from "vitest";

import {
  addExcluded,
  EXCLUDED_KEY,
  isExcluded,
  normaliseDomain,
  readExcluded,
  removeExcluded,
  type ExcludedStore,
} from "./excluded";

function store(initial: string[] = []): ExcludedStore & { value: () => string[] } {
  let held: unknown = initial.length > 0 ? initial : undefined;
  return {
    get: (key) => Promise.resolve(key === EXCLUDED_KEY ? { [EXCLUDED_KEY]: held } : {}),
    set: (values) => {
      held = values[EXCLUDED_KEY];
      return Promise.resolve();
    },
    value: () => (Array.isArray(held) ? (held as string[]) : []),
  };
}

describe("normaliseDomain", () => {
  it("takes the registrable domain from a full url", () => {
    expect(normaliseDomain("https://accounts.google.com/signin")).toBe("google.com");
  });

  it("accepts a bare domain, which is what people type", () => {
    expect(normaliseDomain("example.com")).toBe("example.com");
    expect(normaliseDomain("  Example.COM  ")).toBe("example.com");
  });

  it("keeps tenants on a shared host apart", () => {
    // Excluding alice.github.io must not exclude bob's.
    expect(normaliseDomain("alice.github.io")).toBe("alice.github.io");
    expect(normaliseDomain("bob.github.io")).toBe("bob.github.io");
  });

  it("falls back to the hostname for names the suffix list does not know", () => {
    expect(normaliseDomain("http://localhost:3000")).toBe("localhost");
    expect(normaliseDomain("http://192.168.1.1")).toBe("192.168.1.1");
  });

  it("returns null for nonsense", () => {
    expect(normaliseDomain("")).toBeNull();
    expect(normaliseDomain("   ")).toBeNull();
  });
});

describe("the list", () => {
  it("starts empty", async () => {
    expect(await readExcluded(store())).toEqual([]);
  });

  it("adds a domain, normalised", async () => {
    const s = store();
    await addExcluded(s, "https://www.Example.com/login");
    expect(s.value()).toEqual(["example.com"]);
  });

  it("does not add the same domain twice", async () => {
    const s = store();
    await addExcluded(s, "example.com");
    await addExcluded(s, "https://mail.example.com");
    expect(s.value()).toEqual(["example.com"]);
  });

  it("keeps the list sorted, so it reads as a list rather than a log", async () => {
    const s = store();
    await addExcluded(s, "zeta.com");
    await addExcluded(s, "alpha.com");
    expect(s.value()).toEqual(["alpha.com", "zeta.com"]);
  });

  it("ignores something that is not a domain", async () => {
    const s = store();
    await addExcluded(s, "   ");
    expect(s.value()).toEqual([]);
  });

  it("removes a domain", async () => {
    const s = store(["a.com", "b.com"]);
    await removeExcluded(s, "a.com");
    expect(s.value()).toEqual(["b.com"]);
  });

  it("survives storage holding something unexpected", async () => {
    const broken: ExcludedStore = {
      get: () => Promise.resolve({ [EXCLUDED_KEY]: "not an array" }),
      set: () => Promise.resolve(),
    };
    expect(await readExcluded(broken)).toEqual([]);
  });
});

describe("isExcluded", () => {
  const list = ["example.com", "bank.test"];

  it("is false when the list is empty", () => {
    expect(isExcluded("https://anything.com", [])).toBe(false);
  });

  it("matches the page's registrable domain", () => {
    expect(isExcluded("https://example.com/login", list)).toBe(true);
  });

  it("covers subdomains", () => {
    // Excluding a site has to mean the whole site, or the setting is a trap.
    expect(isExcluded("https://secure.bank.test/account", list)).toBe(true);
  });

  it("leaves other sites alone", () => {
    expect(isExcluded("https://github.com", list)).toBe(false);
    expect(isExcluded("https://notexample.com", list)).toBe(false);
  });

  it("treats an unparseable url as excluded", () => {
    // A page we cannot identify is a page we should not inject into.
    expect(isExcluded("", list)).toBe(true);
  });
});
