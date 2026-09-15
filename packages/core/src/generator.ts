import { wordlist } from "@scure/bip39/wordlists/english.js";

export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
};

const CLASSES = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
} as const;

const CLASS_NAMES = ["lowercase", "uppercase", "digits", "symbols"] as const;

/** The characters people misread when copying a password by hand or eye. */
const AMBIGUOUS = /[Il1O0]/g;

/**
 * Uniform random index via rejection sampling.
 *
 * `value % bound` alone is biased toward low indices whenever `bound` does not
 * divide 2^32 - which is every alphabet we use. The bias is small but it would
 * apply to every password this app ever generates.
 */
function randomIndex(bound: number): number {
  if (bound <= 0) throw new Error("bound must be positive");

  const limit = Math.floor(0xffff_ffff / bound) * bound;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);

  return value % bound;
}

function pick(alphabet: string): string {
  return alphabet.charAt(randomIndex(alphabet.length));
}

/** Fisher-Yates, so the one-per-class characters do not sit in a fixed order. */
function shuffle(characters: string[]): string[] {
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }
  return characters;
}

export function generatePassword(options: GeneratorOptions): string {
  const enabled = CLASS_NAMES.filter((name) => options[name])
    .map((name) =>
      options.excludeAmbiguous ? CLASSES[name].replace(AMBIGUOUS, "") : CLASSES[name],
    )
    .filter((alphabet) => alphabet.length > 0);

  if (enabled.length === 0) {
    throw new Error("at least one character class must be enabled");
  }
  if (options.length < enabled.length) {
    throw new Error("length must be at least the number of enabled character classes");
  }

  // One from each class first, so every enabled class is genuinely represented
  // rather than merely probable.
  const characters = enabled.map(pick);
  const combined = enabled.join("");
  while (characters.length < options.length) characters.push(pick(combined));

  return shuffle(characters).join("");
}

/**
 * Random words from the BIP-39 English wordlist.
 *
 * Exposed separately from `generatePassphrase` because that function enforces a
 * three-word MINIMUM for strength, and that rule is about passphrases. A
 * generated username is not a secret and two words is a perfectly good handle -
 * routing it through the passphrase guard coupled a naming convenience to a
 * cryptographic floor it has no business obeying.
 */
export function randomWords(count: number): string[] {
  return Array.from(
    { length: Math.max(0, count) },
    () => wordlist[randomIndex(wordlist.length)]!,
  );
}

/**
 * A diceware-style passphrase from the BIP-39 English wordlist: 2048 audited
 * words, so 11 bits of entropy per word. Six words is 66 bits and still
 * memorable, which is the whole point of offering this alongside a random
 * string.
 */
export function generatePassphrase(wordCount: number, separator: string): string {
  if (wordCount < 3) throw new Error("a passphrase needs at least 3 words");

  return randomWords(wordCount).join(separator);
}
