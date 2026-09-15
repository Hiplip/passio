/**
 * Whether a new account may be created.
 *
 * Extracted from the Better Auth database hook so the decision can be tested.
 * The hook itself cannot be: it needs a live Better Auth context and a real
 * database, and this is the one rule where being wrong is either a deployment
 * that refuses its own owner or one that accepts the whole internet.
 */
export function registrationAllowed(open: boolean, anyUserExists: boolean): boolean {
  if (open) return true;
  // Closed: the first account is the only account, which is how this
  // deployment has behaved since it existed.
  return !anyUserExists;
}
