import { describe, expect, it } from "vitest";

import { landingCta } from "./landing-cta";

describe("landingCta", () => {
  it("invites a stranger to create a vault when registration is open", () => {
    const cta = landingCta(true);
    expect(cta.href).toBe("/signup");
    expect(cta.label).toBe("Create your vault");
  });

  it("never points at signup when registration is closed", () => {
    // The whole reason this is a function. `registrationAllowed` rejects the
    // account at the Better Auth database hook, so a "Create your vault"
    // button would walk someone through a form that cannot succeed.
    const cta = landingCta(false);
    expect(cta.href).not.toBe("/signup");
    expect(cta.href).toBe("/login");
  });

  it("says what closed means rather than failing silently", () => {
    expect(landingCta(false).note).toMatch(/closed/i);
  });

  it("says what happens next, never 'Get started'", () => {
    for (const open of [true, false]) {
      expect(landingCta(open).label).not.toMatch(/get started/i);
    }
  });
});
