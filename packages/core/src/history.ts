import { HISTORY_LIMIT, type Item } from "./schema";

/**
 * Keeps the passwords an item used to have.
 *
 * Every competitor has this, and the reason is not nostalgia: when you rotate a
 * password and the site silently keeps the old one on a second server, or a
 * backup restores an old session, the previous value is the only way back in.
 * Losing it turns a recoverable annoyance into a locked account.
 *
 * The list lives inside the encrypted blob rather than in its own table. A
 * table would tell the server exactly when each password changed, and a change
 * schedule is a usage pattern worth hiding on its own.
 */

/** Which field on this item type counts as "the password" for history. */
function passwordOf(item: Item): string | undefined {
  switch (item.type) {
    case "login":
      return item.password;
    default:
      return undefined;
  }
}

/**
 * Records a password change, newest first.
 *
 * Returns the item unchanged when nothing meaningful happened, so callers can
 * pass every save through this without checking first.
 *
 * `now` is injected rather than read from the clock: a function that reads the
 * time is a function whose tests are flaky on a slow machine.
 */
export function recordPasswordChange(previous: Item, next: Item, now: Date): Item {
  if (next.type !== "login" || previous.type !== "login") return next;

  const before = passwordOf(previous);
  const after = passwordOf(next);

  // Nothing to remember: no old value, or it did not actually change. An empty
  // old password is not worth a slot, and neither is a no-op save.
  if (!before || before === after) return next;

  const entry = { password: before, changedAt: now.toISOString() };

  // A password that comes back round - reverted, then changed again - should
  // not occupy two slots in a list of ten.
  const kept = (next.history ?? []).filter((h) => h.password !== before);

  return { ...next, history: [entry, ...kept].slice(0, HISTORY_LIMIT) };
}

/** How many previous passwords an item is carrying. */
export function historyCount(item: Item): number {
  return item.type === "login" ? (item.history?.length ?? 0) : 0;
}

/** Drops the whole list. Offered because a history is a list of secrets, and
 *  someone clearing it out has a right to. */
export function clearHistory(item: Item): Item {
  if (item.type !== "login") return item;
  const { history: _dropped, ...rest } = item;
  return rest;
}
