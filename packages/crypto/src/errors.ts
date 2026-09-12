/**
 * The recovery key a person typed is not usable: mistyped, truncated, or in the
 * wrong shape. Distinct from a bare `Error` so a caller can tell "ask them to
 * check what they typed" apart from a genuine bug in this module.
 *
 * Lives in its own module rather than in `recovery.ts` because `encoding.ts`
 * throws it too, and `recovery.ts` imports `encoding.ts`.
 */
export class RecoveryKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryKeyError";
  }
}
