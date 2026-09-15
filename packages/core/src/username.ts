import { randomWords } from "./generator";

/**
 * Making up a username.
 *
 * The point is not novelty, it is unlinkability: reusing one handle across
 * sites lets anyone who sees two of them join your accounts together, and a
 * breach at one site becomes a search term everywhere else.
 *
 * Every mode draws its randomness from the same audited source the password
 * generator uses, via `generatePassphrase` and `crypto.getRandomValues`. None
 * of them touches the network - the alias services Bitwarden integrates with
 * all require an API key, and this product has no third-party keys.
 */

export const USERNAME_MODES = ["words", "random", "plus"] as const;
export type UsernameMode = (typeof USERNAME_MODES)[number];

export const USERNAME_LABELS: Record<UsernameMode, string> = {
  words: "Words",
  random: "Random letters",
  plus: "Plus address",
};

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/** Uniform over `alphabet`, rejecting the biased tail of the random range. */
function pick(alphabet: string, count: number): string {
  const out: string[] = [];
  // The largest multiple of the alphabet that fits in a byte. Values above it
  // are discarded rather than folded in, which is what keeps the distribution
  // flat - modulo alone favours the first few characters.
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;

  while (out.length < count) {
    const bytes = new Uint8Array(count);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(alphabet[byte % alphabet.length]!);
      if (out.length === count) break;
    }
  }

  return out.join("");
}

export interface UsernameOptions {
  mode: UsernameMode;
  /** `words` only: how many words to join. */
  words?: number;
  /** `random` only: how many characters. */
  length?: number;
  /** `plus` only: the address to tag. */
  email?: string;
  /** Append digits, so a taken handle can be retried without rethinking it. */
  digits?: boolean;
}

/**
 * A plus address: `you+tag@example.com`.
 *
 * Most mail providers deliver these to the same inbox while letting you see
 * which site leaked, and filter it away afterwards. It is the only mode that
 * still reveals your real address, which the UI should say.
 */
function plusAddress(email: string, tag: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at);

  // A local part that already has a tag gets its tag replaced, not stacked:
  // "you+old+new@" is not deliverable everywhere.
  const base = local.split("+")[0] ?? local;
  return `${base}+${tag}${domain}`;
}

export function generateUsername(options: UsernameOptions): string {
  const suffix = options.digits ? pick(DIGITS, 4) : "";

  switch (options.mode) {
    case "words": {
      const count = Math.max(1, Math.min(6, options.words ?? 2));
      // The same audited wordlist and uniform picker the passphrase generator
      // uses, without its three-word minimum - that rule is about passphrase
      // strength and a username is not a secret.
      return randomWords(count).join("") + suffix;
    }

    case "random": {
      const length = Math.max(4, Math.min(64, options.length ?? 12));
      return pick(LOWER, length) + suffix;
    }

    case "plus": {
      const email = options.email?.trim() ?? "";
      if (email.length === 0 || !email.includes("@")) return "";
      const tag = pick(LOWER, 6) + suffix;
      return plusAddress(email, tag);
    }
  }
}
