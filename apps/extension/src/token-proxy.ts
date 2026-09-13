import type { BackgroundRequest, BackgroundResponse } from "./messages";
import type { TokenStore } from "./auth";

/** Injected so this is testable without a browser. */
export type SendToBackground = (req: BackgroundRequest) => Promise<BackgroundResponse>;

const send: SendToBackground = (req) => chrome.runtime.sendMessage(req);

/**
 * A TokenStore for the offscreen document, backed by the service worker.
 *
 * An offscreen document's only extension API is `chrome.runtime`. Touching
 * `chrome.storage` there throws "Cannot read properties of undefined (reading
 * 'local')" - which is exactly what shipped before this existed, because no
 * test on a machine without a browser can reach that code path.
 *
 * Shaped as a TokenStore so `createCustody` is unchanged: it already took its
 * storage as a dependency.
 */
export function backgroundTokenStore(sendMessage: SendToBackground = send): TokenStore {
  async function ask(req: BackgroundRequest): Promise<BackgroundResponse> {
    const res = await sendMessage(req);
    if (!res.ok) throw new Error(res.error);
    return res;
  }

  return {
    async get() {
      const res = await ask({ target: "background", kind: "tokenRead" });
      return res.ok && res.kind === "tokenRead" && res.token !== null
        ? res.token
        : undefined;
    },
    async set(value) {
      // tokenWrite rejects an empty string at the schema, so guard here rather
      // than letting a blank token surface as a validation error.
      if (!value) return;
      await ask({ target: "background", kind: "tokenWrite", token: value });
    },
    async remove() {
      await ask({ target: "background", kind: "tokenClear" });
    },
  };
}
