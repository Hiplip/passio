import { performDerivation } from "@passio/crypto/worker/derive";
import type { WrappingKey } from "@passio/crypto/types";

const TOKEN_KEY = "passio.session-token";
const EMAIL_KEY = "passio.email";

/**
 * The slice of chrome.storage.local this module uses.
 *
 * Narrow on purpose, so tests can supply a fake: nothing here can run in a real
 * extension context, and there is no browser on the build machine.
 */
export interface TokenStore {
  get(): Promise<string | undefined>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

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

export async function readToken(store: TokenStore): Promise<string | null> {
  const v = await store.get();
  // An empty string reads as "signed in" and then fails every call with a
  // confusing 401 instead of showing the sign-in screen.
  return v ? v : null;
}

export async function writeToken(store: TokenStore, token: string): Promise<void> {
  await store.set(token);
}

export async function clearToken(store: TokenStore): Promise<void> {
  await store.remove();
}

/**
 * Exchanges an auth hash for a session token.
 *
 * Separated from derivation so the offscreen document can reuse it with a hash
 * it derived in a Web Worker, rather than blocking on the main thread.
 */
export async function exchangeAuthHash(
  apiBase: string,
  email: string,
  authHash: string,
): Promise<string> {
  const res = await fetch(`${apiBase}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: authHash }),
  });

  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "Wrong email or master password."
        : "Could not reach passio.",
    );
  }

  const token = res.headers.get("set-auth-token");
  if (!token) throw new Error("Server did not return a session token.");
  return token;
}

export interface SignInResult {
  token: string;
  /** Unwraps the vault key. Phase 2 discards it; the offscreen document keeps it. */
  stretchedKey: WrappingKey;
}

/**
 * Signs in with the derived auth hash, never the master password.
 *
 * One Argon2id pass produces both outputs: `authHash` proves identity to the
 * server, `stretchedKey` unwraps the vault key locally. The server never sees
 * anything it could unwrap a vault with.
 */
export async function signIn(
  apiBase: string,
  email: string,
  masterPassword: string,
): Promise<SignInResult> {
  const { authHash, stretchedKey } = await performDerivation(masterPassword, email);
  return { token: await exchangeAuthHash(apiBase, email, authHash), stretchedKey };
}
