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
 * The right-hand side is REAL. On mount the browser generates an AES-GCM key
 * and encrypts each row, and what renders is those bytes. A mock would have
 * been three lines of Math.random and nobody could tell, which is exactly why
 * it had to be real: this page's claim is that the encryption happens on your
 * device, and the page proves it on your device.
 *
 * The key is thrown away when you close the tab. It is NOT how a vault is
 * actually keyed - a real one derives from your master password through
 * Argon2id at 64 MiB, which takes about a second and has no business running
 * on a marketing page. The label under the panel says so.
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

/** Hex characters shown per row. Two tidy lines in the cipher face. */
const CIPHER_CHARS = 56;

/**
 * What renders before the browser has encrypted anything.
 *
 * Deterministic, and exactly as long as the real thing: a random placeholder
 * would differ between the server and the first client render, and React would
 * throw away the markup and warn. Same length means the panel never resizes
 * when the real bytes land.
 */
function placeholder(index: number): string {
  return "·".repeat(CIPHER_CHARS - index * 4);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Grouped into fours, the way anyone reads a long string of hex out loud. */
function grouped(hex: string): string {
  return (hex.match(/.{1,4}/g) ?? []).join(" ");
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

  React.useEffect(() => {
    let live = true;
    encryptRows()
      .then((next) => {
        if (live) setCiphers(next);
      })
      .catch(() => {
        // WebCrypto is unavailable over plain http on some hosts. The panel
        // keeps its placeholder rather than showing a broken half.
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <figure className="m-0">
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <ColumnHeading className="sm:border-r">On your device</ColumnHeading>
          <ColumnHeading className="max-sm:border-t">On our servers</ColumnHeading>
        </div>

        <div className="rows border-border border-t">
          {ROWS.map((row, index) => (
            <div key={row.title} className="grid grid-cols-1 sm:grid-cols-2">
              <div className="border-border flex items-center gap-3 px-4 py-3.5 sm:border-r">
                <ItemMark name={row.title} type={row.type} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="text-muted-foreground truncate text-xs">{row.detail}</p>
                </div>
                <span aria-hidden className="secret text-muted-foreground text-xs">
                  ••••••••
                </span>
              </div>

              <div className="border-border flex items-center px-4 py-3.5 max-sm:border-t">
                <p
                  className={cn(
                    "secret text-cipher text-[11px] leading-relaxed break-all transition-opacity duration-500",
                    ciphers ? "opacity-100" : "opacity-45",
                  )}
                >
                  {grouped(ciphers?.[index] ?? placeholder(index))}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <figcaption className="text-muted-foreground mt-3 text-xs leading-relaxed">
        Encrypted in your browser just now, with a key this page throws away. Your real
        vault is keyed by your master password through Argon2id, which never leaves the
        device either.
      </figcaption>
    </figure>
  );
}

function ColumnHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "border-border text-muted-foreground px-4 py-2.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </p>
  );
}
