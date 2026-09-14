import { describe, expect, it } from "vitest";

import { MARK_COUNT, markIndex, monogram } from "./identity";

describe("markIndex", () => {
  it("always lands inside the palette", () => {
    const names = [
      "GitHub",
      "",
      "   ",
      "a",
      "🔐 vault",
      "x".repeat(500),
      "https://accounts.google.com/signin",
      "Работа",
    ];
    for (const name of names) {
      const index = markIndex(name);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(MARK_COUNT);
    }
  });

  it("is stable for the same name", () => {
    expect(markIndex("GitHub")).toBe(markIndex("GitHub"));
  });

  it("ignores case and surrounding space", () => {
    expect(markIndex("  GitHub ")).toBe(markIndex("github"));
  });

  it("gives a URL and its service name the same mark", () => {
    // Saving by URL from the extension and renaming it later must not change
    // the colour - that reads as the item having been replaced.
    const expected = markIndex("github");
    expect(markIndex("https://www.github.com/login")).toBe(expected);
    expect(markIndex("github.com")).toBe(expected);
    expect(markIndex("GITHUB.COM")).toBe(expected);
  });

  it("separates different services", () => {
    // Not a guarantee of the algorithm - eight buckets collide by design - but
    // these particular everyday names must not, or the list stops being
    // scannable for the most common vault there is.
    const names = ["github", "google", "stripe", "amazon", "netflix"];
    const marks = new Set(names.map(markIndex));
    expect(marks.size).toBeGreaterThan(1);
  });

  it("spreads a realistic vault across the whole palette", () => {
    const vault = [
      "GitHub", "Google", "Stripe", "Amazon", "Netflix", "Figma", "Vercel",
      "Notion", "Linear", "Cloudflare", "Spotify", "Dropbox", "Slack", "Apple",
      "Microsoft", "PayPal", "Reddit", "Twitter", "LinkedIn", "Discord",
      "Steam", "Twitch", "eBay", "Uber", "Airbnb", "Booking", "Revolut", "Wise",
    ];
    const used = new Set(vault.map(markIndex));
    // A hash that quietly favoured two buckets would make every vault look
    // two-tone, which is the failure this catches.
    expect(used.size).toBeGreaterThanOrEqual(6);
  });

  it("has no index that swallows a third of a vault", () => {
    const vault = Array.from({ length: 400 }, (_, i) => `service-${i}`);
    const counts = new Map<number, number>();
    for (const name of vault) {
      const index = markIndex(name);
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThan(vault.length / 3);
    }
  });
});

describe("monogram", () => {
  it("takes one letter from a single-word name", () => {
    expect(monogram("GitHub")).toBe("G");
    expect(monogram("stripe")).toBe("S");
  });

  it("takes two letters from a multi-word name", () => {
    expect(monogram("Cloud Flare")).toBe("CF");
    expect(monogram("my_bank_login")).toBe("MB");
  });

  it("reduces a URL to its service", () => {
    expect(monogram("https://www.github.com/login")).toBe("G");
  });

  it("falls back rather than rendering nothing", () => {
    expect(monogram("")).toBe("?");
    expect(monogram("   ")).toBe("?");
  });

  it("keeps a whole character when it is a surrogate pair", () => {
    // `"🔐"[0]` is half a surrogate pair and renders as a replacement box.
    const mark = monogram("🔐");
    expect(Array.from(mark)).toHaveLength(1);
    expect(mark).toBe("🔐");
  });

  it("passes through a non-Latin script rather than transliterating", () => {
    expect(monogram("Работа")).toBe("Р");
  });

  it("never returns more than two characters", () => {
    for (const name of ["a b c d e", "one two three", "🔐 🔑 vault"]) {
      expect(Array.from(monogram(name)).length).toBeLessThanOrEqual(2);
    }
  });
});
