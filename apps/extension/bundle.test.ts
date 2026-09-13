import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Assertions about the BUILT extension.
 *
 * There is no browser on the build machine, so nothing here proves the
 * extension works. What it proves is that the bundle has the shape the design
 * requires - and every check below corresponds to a real failure, one of which
 * shipped and was found by hand on a real Chrome.
 *
 * Requires `pnpm --filter @passio/extension build`; the root `test` script runs
 * it first.
 */
const OUT = fileURLToPath(new URL("./.output/chrome-mv3/", import.meta.url));

const read = (p: string) => readFileSync(OUT + p, "utf8");
const chunk = (prefix: string) => {
  const name = readdirSync(OUT + "chunks").find((f) => f.startsWith(prefix));
  if (!name) throw new Error(`no chunk starting with "${prefix}" in the build`);
  return read(`chunks/${name}`);
};
const asset = (prefix: string) => {
  const name = readdirSync(OUT + "assets").find((f) => f.startsWith(prefix));
  if (!name) throw new Error(`no asset starting with "${prefix}" in the build`);
  return read(`assets/${name}`);
};
const apisIn = (source: string) =>
  [...new Set(source.match(/chrome\.[a-zA-Z]+/g) ?? [])].sort();

describe("offscreen document", () => {
  it("uses no extension API except chrome.runtime", () => {
    // chrome.runtime is the ONLY extension API available in an offscreen
    // document. Reaching for chrome.storage there throws "Cannot read
    // properties of undefined (reading 'local')" at runtime - which is exactly
    // what shipped once, because no test without a browser reaches that path.
    // The token is proxied through the service worker instead.
    expect(apisIn(chunk("offscreen-"))).toEqual(["chrome.runtime"]);
  });
});

describe("the vault key's blast radius", () => {
  it("keeps Argon2id in the worker asset only", () => {
    expect(asset("worker-")).toContain("argon2");
  });

  it("does not link derivation code into the popup", () => {
    // The popup asks the offscreen document to unlock. If it can derive a key
    // itself, something imported the wrong module and the key has a second
    // possible home.
    expect(chunk("popup-")).not.toContain("argon2");
  });

  it("does not link derivation code into the injected fill script", () => {
    expect(read("content-scripts/fill.js")).not.toContain("argon2");
  });
});

describe("bundle hygiene", () => {
  it("contains no server code", () => {
    // AppRouter is imported for its TYPE only. A value import would drag
    // drizzle, postgres and Better Auth - and the database URL's shape - into
    // a bundle that ships to the browser.
    const everything = [
      chunk("offscreen-"),
      chunk("popup-"),
      read("background.js"),
      read("content-scripts/fill.js"),
    ].join("\n");

    for (const marker of ["drizzle-orm", "better-auth", "pgTable", "postgresql://"]) {
      expect(everything).not.toContain(marker);
    }
  });

  it("ships the fill script at the path the popup injects", () => {
    // The popup calls executeScript({ files: ["content-scripts/fill.js"] }).
    // A renamed output file fails silently at the moment someone clicks Fill.
    expect(read("content-scripts/fill.js").length).toBeGreaterThan(0);
    expect(chunk("popup-")).toContain("content-scripts/fill.js");
  });
});
