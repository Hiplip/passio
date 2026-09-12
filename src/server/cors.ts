/**
 * Cross-origin access for the browser extension, and nothing else.
 *
 * The allowlist is a single hard-coded origin rather than an echo of the
 * request's Origin header. Echoing is the standard way this goes wrong: it
 * turns "allow my extension" into "allow every website", which for an API that
 * serves vault ciphertext is not a small mistake.
 *
 * Credentials are deliberately NOT allowed. The extension authenticates with a
 * bearer token (spec D4), so cookies never need to cross this boundary - which
 * is what lets the web app keep SameSite=Lax on its own session cookie.
 *
 * The id is derived from the committed public key in extension/.identity. It is
 * stable only because the manifest pins that key.
 */
export const EXTENSION_ID = "olifgfoaipigflfaiadpjalokaoonjjo";
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

export function corsHeaders(origin: string | null): Record<string, string> {
  if (origin !== EXTENSION_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": EXTENSION_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-trpc-source",
    "Access-Control-Expose-Headers": "set-auth-token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
