import type { DecryptedItem } from "./decrypt-vault";
import { urisOf } from "./schema";
import { scorePassword, type StrengthLevel } from "./strength";

/**
 * What is wrong with a vault.
 *
 * Entirely client-side, over the already-decrypted items. No server
 * involvement is possible - it cannot read any of this - and none is wanted.
 *
 * The rule for what earns a place here: every finding must be ACTIONABLE and
 * TRUE. "This site might support two-factor authentication" is neither, because
 * knowing it needs a database of sites nobody is going to maintain, and being
 * wrong about it teaches people to ignore the report. A report people ignore is
 * worse than no report.
 */

export interface WeakFinding {
  id: string;
  title: string;
  level: StrengthLevel;
  score: number;
  notes: string[];
}

export interface ReuseFinding {
  /** Items sharing one password. Never the password itself. */
  items: Array<{ id: string; title: string }>;
}

export interface AgeFinding {
  id: string;
  title: string;
  days: number;
}

export interface UnsecuredFinding {
  id: string;
  title: string;
  uri: string;
}

export interface HealthReport {
  weak: WeakFinding[];
  reused: ReuseFinding[];
  old: AgeFinding[];
  unsecured: UnsecuredFinding[];
  /** Items carrying a password at all, which is what the counts are out of. */
  checked: number;
}

/** Older than this and a password is worth revisiting. */
export const DEFAULT_MAX_AGE_DAYS = 365;

function passwordOf(item: DecryptedItem): string | undefined {
  const data = item.data;
  switch (data.type) {
    case "login":
    case "server":
    case "database":
    case "emailAccount":
      return data.password;
    default:
      return undefined;
  }
}

export function analyseVault(
  items: DecryptedItem[],
  now: Date,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
): HealthReport {
  const weak: WeakFinding[] = [];
  const old: AgeFinding[] = [];
  const unsecured: UnsecuredFinding[] = [];

  // Grouped by password, but the password itself never leaves this function -
  // a report that listed them would be a plaintext dump of the vault.
  const byPassword = new Map<string, Array<{ id: string; title: string }>>();

  let checked = 0;

  for (const item of items) {
    const password = passwordOf(item);

    if (password && password.length > 0) {
      checked += 1;

      const strength = scorePassword(password);
      if (strength.level === "weak" || strength.level === "fair") {
        weak.push({
          id: item.id,
          title: item.data.title,
          level: strength.level,
          score: strength.score,
          notes: strength.notes,
        });
      }

      const group = byPassword.get(password) ?? [];
      group.push({ id: item.id, title: item.data.title });
      byPassword.set(password, group);

      const changed = lastChanged(item);
      const days = Math.floor((now.getTime() - changed.getTime()) / 86_400_000);
      if (days >= maxAgeDays) {
        old.push({ id: item.id, title: item.data.title, days });
      }
    }

    for (const entry of urisOf(item.data)) {
      if (entry.match === "never") continue;
      if (/^http:\/\//i.test(entry.uri.trim())) {
        unsecured.push({ id: item.id, title: item.data.title, uri: entry.uri });
      }
    }
  }

  const reused: ReuseFinding[] = [...byPassword.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ items: group }));

  return {
    weak: weak.sort((a, b) => a.score - b.score),
    reused: reused.sort((a, b) => b.items.length - a.items.length),
    old: old.sort((a, b) => b.days - a.days),
    unsecured,
    checked,
  };
}

/**
 * When this item's password last changed.
 *
 * History first, because it records the password specifically. `updatedAt`
 * covers any edit at all - renaming an item would otherwise make its password
 * look freshly rotated when it is years old.
 */
function lastChanged(item: DecryptedItem): Date {
  if (item.data.type === "login") {
    const newest = item.data.history?.[0]?.changedAt;
    if (newest) {
      const parsed = new Date(newest);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return item.updatedAt;
}

/** One number for the whole vault, for a headline. Higher is better. */
export function healthScore(report: HealthReport): number {
  if (report.checked === 0) return 100;

  const reusedCount = report.reused.reduce((n, group) => n + group.items.length, 0);
  const problems = report.weak.length + reusedCount + report.old.length;

  // Capped at the number checked, so a vault where every password is weak AND
  // reused does not score below zero.
  return Math.max(0, Math.round(100 - (problems / (report.checked * 2)) * 100));
}
