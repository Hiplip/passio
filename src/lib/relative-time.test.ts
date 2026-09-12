import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const NOW = new Date("2026-09-12T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms);

describe("relativeTime", () => {
  it("reads anything under a minute as just now", () => {
    expect(relativeTime(ago(0), NOW)).toBe("just now");
    expect(relativeTime(ago(59_000), NOW)).toBe("just now");
  });

  it("singularises one minute, hour and day", () => {
    expect(relativeTime(ago(60_000), NOW)).toBe("1 minute ago");
    expect(relativeTime(ago(3_600_000), NOW)).toBe("1 hour ago");
    expect(relativeTime(ago(86_400_000), NOW)).toBe("1 day ago");
  });

  it("pluralises everything else", () => {
    expect(relativeTime(ago(2 * 60_000), NOW)).toBe("2 minutes ago");
    expect(relativeTime(ago(5 * 3_600_000), NOW)).toBe("5 hours ago");
    expect(relativeTime(ago(3 * 86_400_000), NOW)).toBe("3 days ago");
  });

  it("falls back to a date beyond a month, which is easier to place", () => {
    const old = relativeTime(ago(40 * 86_400_000), NOW);
    expect(old).not.toMatch(/ago/);
    expect(old).toMatch(/2026/);
  });

  it("never prints a negative interval when the clock is skewed", () => {
    expect(relativeTime(new Date(NOW + 60_000), NOW)).toBe("just now");
  });
});
