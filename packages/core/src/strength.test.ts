import { describe, expect, it } from "vitest";

import { scorePassword, STRENGTH_LEVELS } from "./strength";

const level = (password: string) => scorePassword(password).level;

describe("scorePassword", () => {
  it("always returns a level from the list and a score in range", () => {
    for (const password of [
      "",
      "a",
      "password",
      "correct horse battery staple",
      "x".repeat(200),
    ]) {
      const result = scorePassword(password);
      expect(STRENGTH_LEVELS).toContain(result.level);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it("calls an empty password weak and says why", () => {
    const result = scorePassword("");
    expect(result.level).toBe("weak");
    expect(result.notes.join(" ")).toMatch(/no password/i);
  });

  it("calls the classics weak", () => {
    for (const password of ["password", "123456", "qwerty", "letmein", "iloveyou"]) {
      expect(level(password), password).toBe("weak");
    }
  });

  it("is not fooled by a number and a symbol on the end", () => {
    // The commonest bad password in the world. Eleven characters and three
    // character classes, and still "password".
    const result = scorePassword("Password1!");
    expect(result.level).toBe("weak");
    expect(result.notes.join(" ")).toMatch(/common word/i);
  });

  it("marks a keyboard run down", () => {
    const result = scorePassword("qwertyuiop");
    expect(result.level).toBe("weak");
    expect(result.notes.join(" ")).toMatch(/keyboard/i);
  });

  it("marks a repeated character down", () => {
    const result = scorePassword("aaaaaaaaaaaa");
    expect(result.notes.join(" ")).toMatch(/repeats/i);
    expect(result.level).toBe("weak");
  });

  it("rates a long passphrase strong, even with one character class", () => {
    // Four random words beat eight jumbled characters, and a scorer that says
    // otherwise teaches people the wrong lesson.
    expect(level("correct horse battery staple")).toBe("strong");
    expect(level("plaster-mimosa-tundra-verbatim")).toBe("strong");
  });

  it("rates a long random string strong", () => {
    expect(level("K7#mQ2$vL9!pX4&z")).toBe("strong");
  });

  it("rates short but varied as no better than fair", () => {
    const result = scorePassword("aB3$");
    expect(["weak", "fair"]).toContain(result.level);
    expect(result.notes.join(" ")).toMatch(/short/i);
  });

  it("notes when there is only one kind of character", () => {
    expect(scorePassword("abcdefghij").notes.join(" ")).toMatch(/one kind/i);
  });

  it("never rewards making a password shorter", () => {
    // A scorer that is not monotonic in length teaches the wrong thing.
    const base = "Xq7$vR2!nW9&";
    let previous = 0;
    for (let n = 4; n <= base.length; n += 2) {
      const score = scorePassword(base.slice(0, n)).score;
      expect(score, base.slice(0, n)).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it("does not throw on anything thrown at it", () => {
    for (const password of ["padlock emoji", "   ".repeat(20), "a\nb\tc", "é".repeat(30)]) {
      expect(() => scorePassword(password)).not.toThrow();
    }
  });
});
