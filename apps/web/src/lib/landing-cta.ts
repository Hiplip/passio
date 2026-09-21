/**
 * The landing page's single call to action.
 *
 * There is exactly one, deliberately: every extra button on a page like this
 * is another way to choose nothing. What it SAYS has to match what the
 * deployment will actually do, which is the reason this is a function rather
 * than a hard-coded link.
 *
 * When registration is closed, `registrationAllowed` rejects the account at
 * the Better Auth database hook - so a button reading "Create your vault"
 * would walk a stranger through a form that cannot succeed. Pointing them at
 * sign-in instead is the honest version of the same page, and it flips back
 * on its own the moment REGISTRATION_OPEN is set.
 */
export interface LandingCta {
  /** Says what happens next, not "Get started". */
  label: string;
  href: string;
  /** Shown under the button only when there is something to explain. */
  note: string | null;
}

export function landingCta(registrationOpen: boolean): LandingCta {
  if (registrationOpen) {
    return {
      label: "Create your vault",
      href: "/signup",
      note: "Takes about a minute. No card, no email verification.",
    };
  }

  return {
    label: "Sign in",
    href: "/login",
    note: "New vaults are closed while passio is in private beta.",
  };
}
