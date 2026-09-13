/**
 * Minutes of idle before the vault locks.
 *
 * No "never" option. The extension holds a live vault key, and a browser left
 * open on a shared machine is the exact situation auto-lock exists for.
 */
export const LOCK_CHOICES = [1, 5, 15, 30, 60] as const;
export const DEFAULT_LOCK_MINUTES = 15;
export const LOCK_MINUTES_KEY = "passio.lock-minutes";

export function normaliseLockMinutes(value: unknown): number {
  return typeof value === "number" &&
    (LOCK_CHOICES as readonly number[]).includes(value)
    ? value
    : DEFAULT_LOCK_MINUTES;
}
