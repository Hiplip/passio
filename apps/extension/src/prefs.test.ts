import { describe, expect, it } from "vitest";

import { LOCK_CHOICES, normaliseLockMinutes } from "./prefs";

describe("normaliseLockMinutes", () => {
  it("keeps a valid choice", () => {
    for (const c of LOCK_CHOICES) expect(normaliseLockMinutes(c)).toBe(c);
  });

  it("falls back to 15 for anything unrecognised", () => {
    for (const bad of [undefined, null, 0, -1, 9999, "15", NaN, {}, []]) {
      expect(normaliseLockMinutes(bad)).toBe(15);
    }
  });

  it("never offers a 'never lock' option", () => {
    // A vault that never locks is a vault left open on a shared machine.
    expect(LOCK_CHOICES).not.toContain(0);
    expect(Math.max(...LOCK_CHOICES)).toBeLessThanOrEqual(60);
  });
});
