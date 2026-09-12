const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short, human reading of when something last changed.
 *
 * Deliberately coarse: on an item screen the useful question is "is this
 * current?", not the exact minute. Anything older than a month falls back to a
 * date, because "37 days ago" is harder to place than the date itself.
 */
export function relativeTime(value: Date, now: number = Date.now()): string {
  const elapsed = now - value.getTime();

  if (elapsed < 0) return "just now"; // clock skew should not print "in -3 minutes"
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 30 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return value.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
