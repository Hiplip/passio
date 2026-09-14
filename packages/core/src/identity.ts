/**
 * An item's visual identity, computed locally from its own name.
 *
 * Every other password manager brands a row with a fetched favicon. passio
 * cannot: asking a CDN for github.com's icon tells that CDN you hold a GitHub
 * account, and doing it for every row hands over your entire account list. A
 * zero-knowledge vault that leaked its index through image requests would be
 * zero-knowledge in name only.
 *
 * So the mark is derived instead. Same input, same colour and same monogram,
 * on every device, forever, with no network and no stored state.
 */

/** How many hues the palette offers. Fixed lightness and chroma, hue varies -
 *  see the --mark-N-* tokens. */
export const MARK_COUNT = 8;

/**
 * Strips a title down to the part that identifies the service.
 *
 * "https://www.github.com/login" and "GitHub" should land on the same mark,
 * because to the person reading the list they are the same account. Without
 * this, saving an item by URL and later renaming it would silently change its
 * colour, which reads as the item having been replaced.
 */
function seedOf(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (trimmed.length === 0) return "";

  // A bare hostname is the common case for items created by the extension.
  const host = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/.exec(
    trimmed,
  );
  if (host?.[1]) {
    const labels = host[1].split(".");
    // The registrable label, not the TLD: "github.com" seeds on "github".
    return labels[labels.length - 2] ?? host[1];
  }

  return trimmed;
}

/**
 * FNV-1a, 32-bit.
 *
 * Chosen for being tiny, dependency-free and identical everywhere - not for
 * any security property. Nothing here is a secret: the mark is derived from a
 * title the user can already see, and it never leaves the device.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    // The FNV prime, by shifts, so the result stays inside 32 bits.
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/** Which of the eight hues this name gets. Stable for the life of the name. */
export function markIndex(name: string): number {
  const seed = seedOf(name);
  if (seed.length === 0) return 0;
  return hash(seed) % MARK_COUNT;
}

/**
 * The one or two letters shown inside the mark.
 *
 * Two letters when the name is several words ("Cloud Flare" reads as CF); one
 * otherwise, because "GI" for GitHub is noise where "G" is a landmark. Emoji
 * and scripts outside the Latin range pass through unchanged - a Cyrillic or
 * Japanese title should show its own first character, not a transliteration.
 */
export function monogram(name: string): string {
  const seed = seedOf(name);
  if (seed.length === 0) return "?";

  const words = seed.split(/[\s._/-]+/u).filter((w) => w.length > 0);
  // Array.from, not indexing: a surrogate pair or an emoji is one character to
  // a reader and two to `string[0]`, which would render half a glyph.
  const first = Array.from(words[0] ?? seed)[0] ?? "?";

  if (words.length > 1) {
    const second = Array.from(words[1] ?? "")[0];
    if (second) return (first + second).toUpperCase();
  }

  return first.toUpperCase();
}
