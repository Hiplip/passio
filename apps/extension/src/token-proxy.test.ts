import { describe, expect, it } from "vitest";

import type { BackgroundRequest, BackgroundResponse } from "./messages";
import { backgroundTokenStore, type SendToBackground } from "./token-proxy";

function sender(handler: (req: BackgroundRequest) => BackgroundResponse) {
  const calls: BackgroundRequest[] = [];
  const send: SendToBackground = (req) => {
    calls.push(req);
    return Promise.resolve(handler(req));
  };
  return { send, calls };
}

describe("backgroundTokenStore", () => {
  it("reads a token through the background", async () => {
    const { send, calls } = sender(() => ({
      ok: true, kind: "tokenRead", token: "T",
    }));
    expect(await backgroundTokenStore(send).get()).toBe("T");
    expect(calls).toEqual([{ target: "background", kind: "tokenRead" }]);
  });

  it("maps a null token to undefined", async () => {
    const { send } = sender(() => ({ ok: true, kind: "tokenRead", token: null }));
    expect(await backgroundTokenStore(send).get()).toBeUndefined();
  });

  it("writes a token through the background", async () => {
    const { send, calls } = sender(() => ({ ok: true, kind: "tokenWrite" }));
    await backgroundTokenStore(send).set("T");
    expect(calls).toEqual([
      { target: "background", kind: "tokenWrite", token: "T" },
    ]);
  });

  it("does not send an empty write", async () => {
    // tokenWrite requires a non-empty token, so an empty set would come back
    // as a schema failure rather than a no-op.
    const { send, calls } = sender(() => ({ ok: true, kind: "tokenWrite" }));
    await backgroundTokenStore(send).set("");
    expect(calls).toEqual([]);
  });

  it("clears through the background", async () => {
    const { send, calls } = sender(() => ({ ok: true, kind: "tokenClear" }));
    await backgroundTokenStore(send).remove();
    expect(calls).toEqual([{ target: "background", kind: "tokenClear" }]);
  });

  it("turns a failed reply into a thrown error", async () => {
    const { send } = sender(() => ({ ok: false, error: "Storage failed." }));
    await expect(backgroundTokenStore(send).get()).rejects.toThrow("Storage failed.");
  });

  it("never touches chrome.storage itself", async () => {
    // The whole reason this module exists. An offscreen document's only
    // extension API is chrome.runtime; reading chrome.storage there throws
    // "Cannot read properties of undefined (reading 'local')". This test runs
    // with no `chrome` global at all, so any direct access would throw.
    expect(globalThis).not.toHaveProperty("chrome");
    const { send } = sender(() => ({ ok: true, kind: "tokenRead", token: "T" }));
    await expect(backgroundTokenStore(send).get()).resolves.toBe("T");
  });
});
