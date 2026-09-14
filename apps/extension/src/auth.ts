/**
 * The session token, as pure logic, plus the sign-in exchange.
 *
 * **No key derivation and no chrome.storage live here.** Derivation would drag
 * Argon2id into the service worker, which imports this. chrome.storage would
 * put an API the offscreen document does not have into its module graph. Both
 * belong elsewhere: the Web Worker, and chrome-storage.ts.
 *
 * The service worker imports the token helpers, and a module-level import of
 * performDerivation drags Argon2id and all of hash-wasm into the worker bundle
 * with it - 58 kB of crypto in a context that must never derive a key.
 * Derivation belongs to the offscreen document's Web Worker, and nowhere else.
 */


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
