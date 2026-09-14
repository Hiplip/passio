import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Asserts the GENERATED manifest, not the config that produces it.
 *
 * There is no browser on this machine, so nothing here can prove the extension
 * works. What it CAN prove is that the extension never quietly asks for more
 * than it was designed to - which is the regression most likely to go unnoticed
 * in a project whose whole premise is not being trusted with more than
 * necessary. This is the gate that replaces `pnpm smoke` for the extension.
 *
 * Requires `pnpm --filter @passio/extension build` to have run; the root `test`
 * script runs it first.
 */
interface Manifest {
  manifest_version: number;
  key?: string;
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  web_accessible_resources?: { resources: string[]; matches: string[] }[];
  content_security_policy?: { extension_pages?: string };
  content_scripts?: unknown;
  externally_connectable?: unknown;
}

const manifest = JSON.parse(
  readFileSync(
    new URL("./.output/chrome-mv3/manifest.json", import.meta.url),
    "utf8",
  ),
) as Manifest;

describe("generated manifest", () => {
  it("is manifest v3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("requests exactly the designed permission set", () => {
    // Sorted so the assertion does not depend on declaration order. Changing
    // this list is a design decision: update the spec's D3a table with it.
    expect([...(manifest.permissions ?? [])].sort()).toEqual([
      "activeTab",
      "alarms",
      "idle",
      "offscreen",
      "scripting",
      "storage",
      "tabs",
    ]);
  });

  it("reaches exactly one origin, and it is the api", () => {
    expect(manifest.host_permissions).toEqual([
      "https://passio-hiplip.vercel.app/*",
    ]);
  });

  it("offers broad access as an opt-in, never a standing grant", () => {
    // Inline suggestions need a script on every page before any click, which
    // activeTab cannot give. Making it OPTIONAL means a default install still
    // has no standing page access: Chrome prompts, and revoking unregisters.
    expect(manifest.optional_host_permissions).toEqual(["<all_urls>"]);
  });

  it("exposes only the suggestion page to web pages", () => {
    // web_accessible_resources leaks the listed URLs to every site. Only the
    // suggestion iframe belongs here, and it renders nothing until the
    // extension messages it.
    expect(manifest.web_accessible_resources?.map((w) => w.resources)).toEqual([
      ["suggestions.html"],
    ]);
  });

  it("never requests broad host access as a standing grant", () => {
    const all = JSON.stringify([manifest.permissions, manifest.host_permissions]);
    expect(all).not.toContain("<all_urls>");
    expect(all).not.toContain("*://*/*");
    expect(all).not.toContain("http://*/*");
    expect(all).not.toContain("https://*/*");
  });

  it("allows webassembly, or hash-wasm cannot load", () => {
    expect(manifest.content_security_policy?.extension_pages).toContain(
      "wasm-unsafe-eval",
    );
  });

  it("does not allow remote script", () => {
    const csp = manifest.content_security_policy?.extension_pages ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("http");
  });

  it("pins the extension id", () => {
    // Without this the id is regenerated on reload and every allowlist that
    // names it - trustedOrigins, CORS - silently stops matching.
    expect(manifest.key).toBeTruthy();
  });

  it("is not reachable from any web page", () => {
    expect(manifest.externally_connectable).toBeUndefined();
  });

  it("declares no content scripts", () => {
    // The fill script is injected at runtime under activeTab, after a click on
    // the toolbar icon. A DECLARED content script would need host permissions
    // for every site it could ever run on - which is exactly the <all_urls>
    // posture this design rejected. If this fails, that decision was undone.
    expect(manifest.content_scripts).toBeUndefined();
  });
});
