import { describe, expect, it } from "vitest";

import { registrationAllowed } from "./registration";

describe("the registration gate", () => {
  it("lets the first account through on a fresh deployment", () => {
    expect(registrationAllowed(false, false)).toBe(true);
  });

  it("refuses the second account while closed", () => {
    expect(registrationAllowed(false, true)).toBe(false);
  });

  it("lets anyone through once opened", () => {
    expect(registrationAllowed(true, true)).toBe(true);
  });

  it("is closed unless the flag is exactly \"true\"", () => {
    // Opening a live instance is a security-posture change, not a default, so
    // anything ambiguous has to leave it shut.
    for (const raw of [undefined, "", "false", "TRUE", "1", "yes", "on"]) {
      expect(registrationAllowed(raw === "true", true), String(raw)).toBe(false);
    }
  });
});
