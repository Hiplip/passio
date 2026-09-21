"use client";

import * as React from "react";

import type { ItemType } from "@passio/core/schema";
import { cn } from "@passio/ui/cn";
import { ItemMark } from "@passio/vault-ui/item-mark";

/**
 * The hero, and the whole argument in one object.
 *
 * Split down the middle by a hairline: on the left, three vault items as you
 * see them; on the right, the only thing the server ever holds. It is the
 * design system's own legible/illegible boundary - the rule the entire product
 * is built on - drawn once at full size instead of explained in a paragraph.
 *
 * And it MOVES, once. The right-hand column renders the readable password
 * first, then scrambles it into the ciphertext over about three quarters of a
 * second. That is the product's single gesture: a thing you can read becoming
 * a thing nobody can. Explaining it in a caption is weaker than showing it,
 * and a page whose claim is "this happens on your device" should do it on the
 * reader's device rather than describe it.
 *
 * The ciphertext is REAL. On mount the browser generates an AES-GCM key and
 * encrypts each row; what settles on screen is those bytes. A mock would have
 * been three lines of Math.random and nobody could have told the difference,
 * which is exactly why it had to be real.
 *
 * The key is thrown away when the tab closes. It is NOT how a vault is keyed -
 * a real one derives from your master password through Argon2id at 64 MiB,
 * which takes about a second and has no business running on a landing page.
 * The caption says so.
 */

interface Row {
  title: string;
  type: ItemType;
  detail: string;
  secret: string;
}

const ROWS: readonly Row[] = [
  {
    title: "Netflix",
    type: "login",
    detail: "ada@fastmail.com",
    secret: "7Qv!nK2rLm94xZ",
  },
  {
    title: "Santander",
    type: "card",
    detail: "Visa, ending 4417",
    secret: "4929 8831 0042 4417",
  },
  {
    title: "Ledger",
    type: "cryptoWallet",
    detail: "Recovery phrase",
    secret: "ribbon fossil update panel",
  },
];

/** Hex characters shown per row once it has settled. */
const CIPHER_CHARS = 56;

/** Same-width glyphs in the cipher face, so the scramble never reflows. */
const GLYPHS = "0123456789abcdef";

const TICKS = 18;
const TICK_MS = 42;
/** Long enough to read the password before it goes. */
const HOLD_MS = 550;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Grouped into fours, the way anyone reads a long string of hex aloud. */
function grouped(value: string): string {
  return (value.match(/.{1,4}/g) ?? []).join(" ");
}

/**
 * The frame at `progress`: cipher on the left of the cursor, noise to the
 * right of it. At progress 0 this is never called - the plain secret renders
 * instead, which is also what the server sends, so hydration matches.
 */
export function frameAt(cipher: string, progress: number): string {
  const locked = Math.floor(cipher.length * progress);
  let out = "";
  for (let i = 0; i < cipher.length; i += 1) {
    out +=
      i < locked ? cipher[i] : (GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "0");
  }
  return out;
}

async function encryptRows(): Promise<string[]> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
  ]);

  return Promise.all(
    ROWS.map(async (row) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode(
        JSON.stringify({ title: row.title, detail: row.detail, secret: row.secret }),
      );
      const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
      return toHex(new Uint8Array(sealed)).slice(0, CIPHER_CHARS);
    }),
  );
}

export function VaultSplit() {
  const [ciphers, setCiphers] = React.useState<string[] | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    let hold: ReturnType<typeof setTimeout> | undefined;

    encryptRows()
      .then((next) => {
        if (!live) return;
        // Hold on the readable password first: the point is the change, and
        // there is no change if nobody saw what it was.
        hold = setTimeout(() => {
          if (live) setCiphers(next);
        }, HOLD_MS);
      })
      .catch(() => {
        // WebCrypto is unavailable over plain http and in some embedded
        // views. Fall back to dots - never to leaving the readable password
        // sitting under a heading that says "on our servers".
        if (live) setFailed(true);
      });

    return () => {
      live = false;
      if (hold) clearTimeout(hold);
    };
  }, []);

  React.useEffect(() => {
    if (!ciphers) return;
    if (prefersReducedMotion()) {
      setProgress(1);
      return;
    }

    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setProgress(Math.min(1, tick / TICKS));
      if (tick >= TICKS) clearInterval(id);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [ciphers]);

  function rightHandSide(index: number): string {
    if (failed) return grouped("·".repeat(CIPHER_CHARS));
    const cipher = ciphers?.[index];
    if (!cipher) return ROWS[index]?.secret ?? "";
    return grouped(progress >= 1 ? cipher : frameAt(cipher, progress));
  }

  const settled = progress >= 1 || failed;

  return (
    <figure className="m-0">
      <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_18px_50px_-24px_oklch(0.185_0.021_285/0.35)]">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <p className="border-border text-muted-foreground border-b px-5 py-3 text-xs font-medium sm:border-r">
            On your device
          </p>
          <p
            className={cn(
              "border-border border-b px-5 py-3 text-xs font-medium transition-colors duration-700",
              settled ? "text-cipher" : "text-muted-foreground",
            )}
          >
            On our servers
          </p>
        </div>

        <div className="rows">
          {ROWS.map((row, index) => (
            <div key={row.title} className="grid grid-cols-1 sm:grid-cols-2">
              <div className="border-border flex items-center gap-3.5 px-5 py-4 sm:border-r">
                <ItemMark name={row.title} type={row.type} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="text-muted-foreground truncate text-xs">{row.detail}</p>
                </div>
              </div>

              <div className="border-border flex min-h-[4.5rem] items-center px-5 py-4 max-sm:border-t">
                <p
                  className={cn(
                    "secret text-cipher text-[11px] leading-[1.7] break-all",
                    !ciphers && !failed && "text-sm",
                  )}
                >
                  {rightHandSide(index)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <figcaption className="text-muted-foreground mt-4 max-w-[54ch] text-xs leading-relaxed">
        Those bytes were encrypted in your browser a moment ago, with a key this page
        throws away. Your real vault is keyed by your master password through Argon2id,
        which never leaves the device either.
      </figcaption>
    </figure>
  );
}
