import { deriveInWorker } from "@passio/crypto/worker/client";

import { API_BASE, createApi } from "../../src/api";
import { clearToken, exchangeAuthHash, readToken, writeToken } from "../../src/auth";
import { createCustody } from "../../src/custody";
import { parseRequest, type Response } from "../../src/messages";
import { backgroundTokenStore } from "../../src/token-proxy";

/**
 * The session token, stored by the service worker on this document's behalf.
 *
 * `chrome.runtime` is the ONLY extension API available here. `chrome.storage`
 * is undefined in an offscreen document, so every token read and write is a
 * message. See src/token-proxy.ts.
 */
const tokens = backgroundTokenStore();

/**
 * The only context in the extension that ever holds the vault key.
 *
 * Argon2id runs in a Web Worker spawned from here rather than on this
 * document's main thread, which is what the offscreen `WORKERS` reason is for.
 */
const custody = createCustody({
  derive: (email, masterPassword) => deriveInWorker(masterPassword, email),
  signIn: (email, authHash) => exchangeAuthHash(API_BASE, email, authHash),
  readToken: () => readToken(tokens),
  writeToken: (t) => writeToken(tokens, t),
  clearToken: () => clearToken(tokens),
  api: (token) => {
    const api = createApi(token);
    return {
      getKeys: () => api.vault.getKeys.query(),
      listItems: () => api.item.list.query(),
    };
  },
});

async function handle(req: NonNullable<ReturnType<typeof parseRequest>>): Promise<Response> {
  switch (req.kind) {
    case "status":
      return { ok: true, kind: "status", state: await custody.status() };
    case "unlock":
      await custody.unlock(req.email, req.password);
      return { ok: true, kind: "unlock" };
    case "lock":
      custody.lock();
      return { ok: true, kind: "lock" };
    case "signOut":
      await custody.signOut();
      return { ok: true, kind: "signOut" };
    case "items":
      return { ok: true, kind: "items", ...(await custody.items()) };
    case "matchCount":
      return { ok: true, kind: "matchCount", count: await custody.matchCount(req.url) };
    case "fieldValue":
      return {
        ok: true,
        kind: "fieldValue",
        value: await custody.fieldValue(req.itemId, req.field),
      };
  }
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  // Only our own extension, and only messages addressed here: the background
  // worker shares this broadcast channel.
  if (sender.id !== chrome.runtime.id) return false;
  const req = parseRequest(raw);
  if (!req) return false;

  handle(req)
    .then(sendResponse)
    .catch((e: unknown) =>
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : "Something went wrong.",
      } satisfies Response),
    );

  return true; // keeps the message channel open for the async reply
});
