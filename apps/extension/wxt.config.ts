import { readFileSync } from "node:fs";
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "wxt";

/**
 * The committed public half of the signing key.
 *
 * Pinning it fixes the extension id, which appears in Better Auth
 * `trustedOrigins` and in the CORS allowlist. An unpinned id is regenerated on
 * every reload, and both allowlists then silently stop matching.
 */
const PUBLIC_KEY = /^PUBKEY=(.*)$/m.exec(
  readFileSync(new URL("./.identity", import.meta.url), "utf8"),
)![1]!;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  // The extension renders @passio/ui, so it needs the same Tailwind build the
  // web app uses. Source paths are declared with @source in the shared
  // stylesheet, not here.
  vite: () => ({ plugins: [tailwind()] }),
  manifest: {
    name: "passio",
    description: "Fill logins from your passio vault.",
    version: "0.1.0",
    key: PUBLIC_KEY,
    permissions: [
      "offscreen", // the document that holds the vault key
      "storage", // session token + auto-lock preference
      "alarms", // auto-lock that survives worker eviction
      "idle", // lock when the system locks
      "activeTab", // touch the current tab, only after a click
      "scripting", // inject the fill function
      "tabs", // read the active tab url for the badge
    ],
    host_permissions: ["https://passio-hiplip.vercel.app/*"],
    // NOT granted at install. Inline suggestions need a content script running
    // before any click, which activeTab cannot provide - so the broad grant is
    // offered as an opt-in behind Chrome's own consent prompt instead of being
    // demanded up front. Revoking it in chrome://extensions unregisters the
    // script. See spec D3 and the inline-autofill plan.
    optional_host_permissions: ["<all_urls>"],
    web_accessible_resources: [
      {
        // The suggestion list renders here, on the extension's origin, so page
        // script cannot read it. It renders nothing until the extension
        // messages it.
        resources: ["suggestions.html"],
        matches: ["<all_urls>"],
      },
    ],
    content_security_policy: {
      // hash-wasm is WebAssembly. Without wasm-unsafe-eval it does not load at
      // all, and Argon2id is the first thing an unlock does.
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // Deliberately absent: externally_connectable. The extension signs in on
    // its own, so no web page ever needs to message it. Spec D6.
  },
});
