/**
 * How strong a password is, scored locally.
 *
 * No dictionary download, no network, no third-party library. The estimate is
 * deliberately conservative: it is better to call a mediocre password weak than
 * to reassure someone about one that is not.
 *
 * This is an approximation of entropy, not a measurement of it. Real strength
 * depends on what an attacker knows about you, which nothing running on your
 * own machine can tell. What it reliably catches is the failure modes that
 * actually appear in real vaults: short, one character class, a word with a
 * number stuck on the end, a keyboard run, or the same character repeated.
 */

export const STRENGTH_LEVELS = ["weak", "fair", "good", "strong"] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

export interface Strength {
  /** 0-100. Only meaningful relative to itself. */
  score: number;
  level: StrengthLevel;
  /** What is holding it back, in the order worth fixing. */
  notes: string[];
}

/**
 * Passwords common enough that their presence makes every other signal moot.
 *
 * A short list on purpose. A real breach corpus is megabytes and would have to
 * be downloaded, which is exactly the outbound request this product avoids;
 * `@passio/core/breach` handles that case properly, with k-anonymity and
 * consent. This catches the ones that should never reach that point.
 */
const COMMON = new Set([
  "password", "123456", "12345678", "123456789", "qwerty", "abc123",
  "letmein", "monkey", "111111", "iloveyou", "admin", "welcome",
  "login", "passw0rd", "dragon", "sunshine", "princess", "football",
  "charlie", "aa123456", "donald", "password1", "qwerty123", "000000",
  "trustno1", "changeme", "secret", "master", "hello", "freedom",
]);

/** Runs on a keyboard, both directions, checked as substrings. */
const SEQUENCES = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "abcdefghijklmnopqrstuvwxyz",
  "01234567890",
];

function classesIn(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  return classes;
}

/** The longest run of one repeated character. */
function longestRepeat(password: string): number {
  let best = 0;
  let run = 1;
  for (let i = 1; i < password.length; i += 1) {
    run = password[i] === password[i - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return Math.max(best, password.length > 0 ? 1 : 0);
}

/** The longest keyboard or alphabet run, forwards or backwards. */
function longestSequence(password: string): number {
  const lower = password.toLowerCase();
  let best = 0;

  for (const row of SEQUENCES) {
    const reversed = [...row].reverse().join("");
    for (const source of [row, reversed]) {
      for (let start = 0; start < source.length; start += 1) {
        for (let end = start + 3; end <= source.length; end += 1) {
          const run = source.slice(start, end);
          if (lower.includes(run) && run.length > best) best = run.length;
        }
      }
    }
  }

  return best;
}

/**
 * Strips a trailing number and a trailing symbol.
 *
 * "Password1!" is "password" wearing a hat. Scoring the stem rather than the
 * whole string is what stops the commonest bad password in the world reading as
 * three character classes and eleven characters.
 */
function stem(password: string): string {
  return password
    .replace(/[^a-zA-Z0-9]+$/, "")
    .replace(/[0-9]+$/, "")
    .toLowerCase();
}

export function scorePassword(password: string): Strength {
  const notes: string[] = [];

  if (password.length === 0) {
    return { score: 0, level: "weak", notes: ["There is no password here."] };
  }

  const classes = classesIn(password);
  const repeat = longestRepeat(password);
  const sequence = longestSequence(password);
  const base = stem(password);

  // Length carries most of the weight, because it genuinely does.
  let score = Math.min(60, password.length * 4);
  score += (classes - 1) * 10;

  if (password.length < 12) {
    notes.push("Short. Length matters more than anything else here.");
  }
  if (classes === 1) {
    notes.push("Only one kind of character.");
  }

  if (repeat >= 3) {
    score -= repeat * 5;
    notes.push("Repeats the same character several times.");
  }

  if (sequence >= 4) {
    score -= sequence * 5;
    notes.push("Contains a run straight off the keyboard.");
  }

  if (COMMON.has(password.toLowerCase())) {
    score = Math.min(score, 8);
    notes.push("This is one of the most guessed passwords there is.");
  } else if (base.length >= 4 && COMMON.has(base)) {
    // The "Password1!" case.
    score = Math.min(score, 25);
    notes.push("A very common word with a number or symbol on the end.");
  }

  // A long passphrase earns back what the class rule takes away: four random
  // words beat eight jumbled characters, and a scorer that says otherwise
  // teaches the wrong lesson.
  if (password.length >= 20 && sequence < 4 && !COMMON.has(base)) {
    score = Math.max(score, 80);
    notes.length = 0;
  }

  score = Math.max(0, Math.min(100, score));

  const level: StrengthLevel =
    score >= 80 ? "strong" : score >= 60 ? "good" : score >= 35 ? "fair" : "weak";

  return { score, level, notes };
}
