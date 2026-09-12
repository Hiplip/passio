import { describe, expect, it } from "vitest";

import { generateTotp, parseTotpInput, secondsRemaining } from "./totp";

// RFC 6238 Appendix B uses the ASCII secret "12345678901234567890".
// In base32 that is:
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("generateTotp against the RFC 6238 published vectors", () => {
  // The RFC tabulates 8-digit values; the 6-digit code is its last six digits.
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1_111_111_109, "081804"],
    [1_111_111_111, "050471"],
    [1_234_567_890, "005924"],
    [2_000_000_000, "279037"],
  ];

  for (const [unixSeconds, expected] of vectors) {
    it(`produces ${expected} at t=${unixSeconds}`, () => {
      expect(generateTotp({ secret: RFC_SECRET }, unixSeconds * 1000)).toBe(expected);
    });
  }

  it("produces the same code throughout a single 30 second window", () => {
    const atStart = generateTotp({ secret: RFC_SECRET }, 1_111_111_080 * 1000);
    const atEnd = generateTotp({ secret: RFC_SECRET }, 1_111_111_109 * 1000);
    expect(atStart).toBe(atEnd);
  });

  it("produces a different code in the next window", () => {
    const before = generateTotp({ secret: RFC_SECRET }, 1_111_111_109 * 1000);
    const after = generateTotp({ secret: RFC_SECRET }, 1_111_111_111 * 1000);
    expect(before).not.toBe(after);
  });
});

describe("secondsRemaining", () => {
  it("reports a full period exactly on the boundary", () => {
    expect(secondsRemaining(30, 0)).toBe(30);
    expect(secondsRemaining(30, 30_000)).toBe(30);
  });

  it("counts down within the period", () => {
    expect(secondsRemaining(30, 29_000)).toBe(1);
    expect(secondsRemaining(30, 15_000)).toBe(15);
  });

  it("honours a non-default period", () => {
    expect(secondsRemaining(60, 10_000)).toBe(50);
  });

  it("never returns zero, so the ring never reads as expired mid-window", () => {
    for (let ms = 0; ms < 60_000; ms += 500) {
      expect(secondsRemaining(30, ms)).toBeGreaterThan(0);
    }
  });
});

describe("parseTotpInput", () => {
  it("accepts a raw base32 secret", () => {
    expect(parseTotpInput(RFC_SECRET)).toEqual({ secret: RFC_SECRET });
  });

  it("strips spaces and uppercases a hand-typed secret", () => {
    expect(parseTotpInput("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")).toEqual({
      secret: RFC_SECRET,
    });
  });

  it("extracts the secret from an otpauth uri", () => {
    const uri = `otpauth://totp/GitHub:me@example.com?secret=${RFC_SECRET}&issuer=GitHub`;
    expect(parseTotpInput(uri)?.secret).toBe(RFC_SECRET);
  });

  it("omits parameters that match the defaults", () => {
    const uri = `otpauth://totp/X?secret=${RFC_SECRET}&digits=6&period=30&algorithm=SHA1`;
    expect(parseTotpInput(uri)).toEqual({ secret: RFC_SECRET });
  });

  it("preserves parameters that differ from the defaults", () => {
    const uri = `otpauth://totp/X?secret=${RFC_SECRET}&digits=8&period=60&algorithm=SHA256`;
    expect(parseTotpInput(uri)).toEqual({
      secret: RFC_SECRET,
      digits: 8,
      period: 60,
      algorithm: "SHA256",
    });
  });

  it("returns null for input that is not a usable secret", () => {
    expect(parseTotpInput("not a secret!!")).toBeNull();
    expect(parseTotpInput("")).toBeNull();
    expect(parseTotpInput("   ")).toBeNull();
  });

  it("returns null for an otpauth uri that is not a totp", () => {
    expect(parseTotpInput(`otpauth://hotp/X?secret=${RFC_SECRET}&counter=1`)).toBeNull();
  });

  it("returns null for a malformed otpauth uri rather than throwing", () => {
    expect(parseTotpInput("otpauth://totp/")).toBeNull();
  });

  it("round-trips: a parsed uri generates the same code as the raw secret", () => {
    const parsed = parseTotpInput(`otpauth://totp/X?secret=${RFC_SECRET}`);
    expect(parsed).not.toBeNull();
    expect(generateTotp(parsed!, 59_000)).toBe(generateTotp({ secret: RFC_SECRET }, 59_000));
  });

  it("parses a non-default config that then generates 8 digits", () => {
    const parsed = parseTotpInput(`otpauth://totp/X?secret=${RFC_SECRET}&digits=8`);
    expect(generateTotp(parsed!, 59_000)).toBe("94287082"); // RFC 6238, 8 digits
  });
});
