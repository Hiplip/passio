import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Assertions about the BUILT extension.
 *
 * There is no browser on the build machine, so nothing here proves the
 * extension works. What it proves is that the bundle has the shape the design
 * requires - and every check below corresponds to a real failure, two of which
 * shipped and were found by hand on a real Chrome.
 *
 * Requires `pnpm --filter @passio/extension build`; the root `test` script runs
 * it first.
 */
const OUT = fileURLToPath(new URL("./.output/chrome-mv3/", import.meta.url));

const read = (p: string) => readFileSync(OUT + p, "utf8");

/**
 * Every byte of JavaScript an HTML entrypoint loads, not just its own chunk.
 *
 * This matters more than it looks. Rolldown hoists code shared between
 * entrypoints into common chunks, so "the popup chunk" became an 8 kB stub the
 * moment the vault page started sharing code with it - and an assertion naming
 * that chunk silently began testing almost nothing. Vite lists the whole
 * transitive graph in the page's modulepreload links, so collecting those plus
 * the entry script gives the real answer.
 */
function pageBundle(html: string): string {
  const page = read(html);
  const paths = [...page.matchAll(/(?:src|href)="\/([^"]+\.js)"/g)].map((m) => m[1]!);
  expect(paths.length, `${html} loads no scripts`).toBeGreaterThan(0);
  return paths.map(read).join("\n");
}

/** The base64 header of any WebAssembly module ("\0asm"), plus hash-wasm's own
 *  name. NOT the string "argon2": that also appears in our own prose - the
 *  offscreen document's `justification` says "Runs Argon2id in a Web Worker" -
 *  so a test for it matches a comment and proves nothing. */
const WASM = "AGFzbQ";
const HASH_WASM = "hash-wasm";

const OFFSCREEN = "offscreen.html";
const POPUP = "popup.html";
const VAULT = "vault.html";
const WORKER = "background.js";
const FILL = "content-scripts/fill.js";

describe("offscreen document", () => {
  it("uses no extension API except chrome.runtime", () => {
    // chrome.runtime is the ONLY extension API available in an offscreen
    // document. Reaching for chrome.storage there throws "Cannot read
    // properties of undefined (reading 'local')" at runtime - which is exactly
    // what shipped once. The token is proxied through the service worker, and
    // chrome-storage.ts is kept out of this document's import graph so this
    // assertion means something.
    const apis = [...new Set(pageBundle(OFFSCREEN).match(/chrome\.[a-zA-Z]+/g) ?? [])];
    expect(apis.sort()).toEqual(["chrome.runtime"]);
  });
});

describe("the vault key's blast radius", () => {
  it("keeps the compiled derivation out of every page and script", () => {
    // It belongs in the Web Worker the offscreen document spawns, which is a
    // separate asset, and nowhere else.
    for (const [name, source] of [
      ["popup", pageBundle(POPUP)],
      ["vault page", pageBundle(VAULT)],
      ["service worker", read(WORKER)],
      ["injected fill script", read(FILL)],
    ] as const) {
      expect(source, `${name} links WebAssembly`).not.toContain(WASM);
      expect(source, `${name} links hash-wasm`).not.toContain(HASH_WASM);
    }
  });
});

describe("bundle hygiene", () => {
  it("contains no server code", () => {
    // AppRouter is imported for its TYPE only. A value import would drag
    // drizzle, postgres and Better Auth into a bundle that ships to a browser.
    const everything = [
      pageBundle(OFFSCREEN),
      pageBundle(POPUP),
      pageBundle(VAULT),
      read(WORKER),
      read(FILL),
    ].join("\n");

    for (const marker of ["drizzle-orm", "better-auth", "pgTable", "postgresql://"]) {
      expect(everything).not.toContain(marker);
    }
  });

  it("ships the full vault page the popup opens", () => {
    expect(read(VAULT).length).toBeGreaterThan(0);
    expect(pageBundle(POPUP)).toContain("vault.html");
  });

  it("ships the fill script at the path the popup injects", () => {
    // The popup calls executeScript({ files: ["content-scripts/fill.js"] }).
    // A renamed output file fails silently at the moment someone clicks Fill.
    expect(read(FILL).length).toBeGreaterThan(0);
    expect(pageBundle(POPUP)).toContain("content-scripts/fill.js");
  });
});
