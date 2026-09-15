import { describe, expect, it } from "vitest";

import { generateUsername, USERNAME_MODES } from "./username";

describe("every mode", () => {
  it("produces something non-empty", () => {
    for (const mode of USERNAME_MODES) {
      const value = generateUsername({ mode, email: "me@example.com" });
      expect(value.length, mode).toBeGreaterThan(0);
    }
  });

  it("does not repeat itself across calls", () => {
    // The entire point is unlinkability. A generator that returns the same
    // handle twice defeats it.
    for (const mode of USERNAME_MODES) {
      const seen = new Set(
        Array.from({ length: 20 }, () =>
          generateUsername({ mode, email: "me@example.com" }),
        ),
      );
      expect(seen.size, mode).toBeGreaterThan(1);
    }
  });
});

describe("words", () => {
  it("joins the requested number of words", () => {
    const value = generateUsername({ mode: "words", words: 3 });
    expect(value.length).toBeGreaterThan(8);
  });

  it("clamps an absurd word count rather than hanging", () => {
    expect(generateUsername({ mode: "words", words: 999 }).length).toBeLessThan(80);
    expect(generateUsername({ mode: "words", words: 0 }).length).toBeGreaterThan(0);
  });

  it("appends digits when asked", () => {
    expect(generateUsername({ mode: "words", digits: true })).toMatch(/[0-9]{4}$/);
  });

  it("appends no digits by default", () => {
    expect(generateUsername({ mode: "words" })).not.toMatch(/[0-9]{4}$/);
  });
});

describe("random", () => {
  it("is the requested length", () => {
    expect(generateUsername({ mode: "random", length: 16 })).toHaveLength(16);
  });

  it("is lowercase letters only", () => {
    expect(generateUsername({ mode: "random", length: 40 })).toMatch(/^[a-z]+$/);
  });

  it("clamps a silly length", () => {
    expect(generateUsername({ mode: "random", length: 1 }).length).toBeGreaterThanOrEqual(4);
    expect(generateUsername({ mode: "random", length: 9999 }).length).toBeLessThanOrEqual(64);
  });

  it("is close to uniform across the alphabet", () => {
    // A modulo-only picker skews toward the first characters. This would catch
    // that: with 26 letters over 5200 draws, no letter should take a tenth.
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i += 1) {
      for (const char of generateUsername({ mode: "random", length: 52 })) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThan(520);
    }
  });
});

describe("plus addresses", () => {
  it("tags the local part", () => {
    const value = generateUsername({ mode: "plus", email: "me@example.com" });
    expect(value).toMatch(/^me\+[a-z]+@example\.com$/);
  });

  it("replaces an existing tag rather than stacking one", () => {
    // "you+old+new@" is not deliverable everywhere.
    const value = generateUsername({ mode: "plus", email: "me+old@example.com" });
    expect(value.split("+")).toHaveLength(2);
    expect(value.startsWith("me+")).toBe(true);
  });

  it("keeps a domain containing an at-sign-free plus", () => {
    const value = generateUsername({ mode: "plus", email: "first.last@sub.example.co.uk" });
    expect(value.endsWith("@sub.example.co.uk")).toBe(true);
  });

  it("returns nothing without a usable address", () => {
    expect(generateUsername({ mode: "plus" })).toBe("");
    expect(generateUsername({ mode: "plus", email: "not an email" })).toBe("");
    expect(generateUsername({ mode: "plus", email: "   " })).toBe("");
  });
});
