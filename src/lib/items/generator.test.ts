import { describe, expect, it } from "vitest";

import {
  DEFAULT_GENERATOR_OPTIONS,
  generatePassphrase,
  generatePassword,
} from "./generator";

const ALL_CLASSES = {
  length: 16,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
};

describe("generatePassword", () => {
  it("honours the requested length", () => {
    for (const length of [8, 16, 32, 64, 128]) {
      expect(generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length })).toHaveLength(
        length,
      );
    }
  });

  it("includes at least one character from every enabled class", () => {
    for (let i = 0; i < 40; i++) {
      const password = generatePassword(ALL_CLASSES);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it("uses only the enabled classes", () => {
    const password = generatePassword({
      ...ALL_CLASSES,
      length: 64,
      uppercase: false,
      digits: false,
      symbols: false,
    });
    expect(password).toMatch(/^[a-z]+$/);
  });

  it("omits ambiguous characters when asked", () => {
    for (let i = 0; i < 40; i++) {
      const password = generatePassword({
        ...ALL_CLASSES,
        length: 64,
        symbols: false,
        excludeAmbiguous: true,
      });
      expect(password).not.toMatch(/[Il1O0]/);
    }
  });

  it("does not place the guaranteed characters in a fixed order", () => {
    // Without a shuffle every password would start lower, upper, digit, symbol.
    const firsts = new Set(
      Array.from({ length: 60 }, () => generatePassword(ALL_CLASSES).charAt(0)),
    );
    expect(firsts.size).toBeGreaterThan(4);
  });

  it("does not repeat itself", () => {
    const seen = new Set(
      Array.from({ length: 100 }, () => generatePassword(DEFAULT_GENERATOR_OPTIONS)),
    );
    expect(seen.size).toBe(100);
  });

  it("distributes characters without modulo bias", () => {
    // `getRandomValues() % 26` skews toward the start of the alphabet. Over
    // 20k single-character samples, 'a' and 'z' should appear at similar rates.
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      const char = generatePassword({
        ...ALL_CLASSES,
        length: 1,
        uppercase: false,
        digits: false,
        symbols: false,
      });
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }

    const first = counts.get("a") ?? 0;
    const last = counts.get("z") ?? 0;
    expect(first).toBeGreaterThan(0);
    expect(last).toBeGreaterThan(0);
    expect(Math.abs(first - last) / Math.max(first, last)).toBeLessThan(0.25);
  });

  it("rejects a request with no character classes enabled", () => {
    expect(() =>
      generatePassword({
        ...ALL_CLASSES,
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow(/character class/i);
  });

  it("rejects a length shorter than the number of enabled classes", () => {
    expect(() => generatePassword({ ...ALL_CLASSES, length: 2 })).toThrow(/length/i);
  });
});

describe("generatePassphrase", () => {
  it("produces the requested number of words", () => {
    expect(generatePassphrase(6, "-").split("-")).toHaveLength(6);
  });

  it("honours the separator", () => {
    expect(generatePassphrase(4, ".").split(".")).toHaveLength(4);
  });

  it("uses real words from the list", () => {
    for (const word of generatePassphrase(8, " ").split(" ")) {
      expect(word).toMatch(/^[a-z]+$/);
      expect(word.length).toBeGreaterThan(2);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generatePassphrase(6, "-")));
    expect(seen.size).toBe(100);
  });

  it("rejects a word count below 3", () => {
    expect(() => generatePassphrase(2, "-")).toThrow(/word/i);
  });
});
