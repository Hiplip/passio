import type { TokenStore } from "./auth";

/**
 * Everything that touches chrome.storage, kept in one module on purpose.
 *
 * The offscreen document must never import this. `chrome.runtime` is its only
 * extension API - `chrome.storage` is undefined there - and it reaches storage
 * through the service worker instead (see token-proxy.ts).
 *
 * Keeping these calls out of shared modules is what makes that checkable: the
 * bundle test asserts the offscreen document's whole module graph never
 * mentions chrome.storage, and that assertion only means something if the code
 * genuinely is not in its graph.
 */
const TOKEN_KEY = "passio.session-token";
const EMAIL_KEY = "passio.email";

export const chromeTokenStore: TokenStore = {
  async get() {
    const r = await chrome.storage.local.get(TOKEN_KEY);
    return r[TOKEN_KEY] as string | undefined;
  },
  async set(value) {
    await chrome.storage.local.set({ [TOKEN_KEY]: value });
  },
  async remove() {
    await chrome.storage.local.remove(TOKEN_KEY);
  },
};

/**
 * The signed-in email address.
 *
 * Stored because unlocking re-derives the key, and derivation salts on the
 * email - so a locked vault needs it back without asking. It is not a secret,
 * and remembering it is the difference between a 15-minute auto-lock being
 * usable and being switched off.
 */
export async function readEmail(): Promise<string | null> {
  const r = await chrome.storage.local.get(EMAIL_KEY);
  const v = r[EMAIL_KEY] as string | undefined;
  return v ? v : null;
}

export async function writeEmail(email: string): Promise<void> {
  await chrome.storage.local.set({ [EMAIL_KEY]: email });
}

export async function clearEmail(): Promise<void> {
  await chrome.storage.local.remove(EMAIL_KEY);
}
