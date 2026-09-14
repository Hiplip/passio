import { deriveInWorker } from "@passio/crypto/worker/client";

import { API_BASE, createApi } from "../../src/api";
import { clearToken, exchangeAuthHash, readToken, writeToken } from "../../src/auth";
import { createCustody } from "../../src/custody";
import { KEEPALIVE_PORT, KEEPALIVE_INTERVAL_MS } from "../../src/keepalive";
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
      listDeletedItems: () => api.item.listDeleted.query(),
      createItem: async (id, ciphertext) => {
        await api.item.create.mutate({ id, ciphertext });
      },
      updateItem: async (id, ciphertext) => {
        await api.item.update.mutate({ id, ciphertext });
      },
      deleteItem: async (id) => {
        await api.item.delete.mutate({ id });
      },
      restoreItem: async (id) => {
        await api.item.restore.mutate({ id });
      },
      listFolders: () => api.folder.list.query(),
      createFolder: async (id, ciphertext) => {
        await api.folder.create.mutate({ id, ciphertext });
      },
      renameFolder: async (id, ciphertext) => {
        await api.folder.rename.mutate({ id, ciphertext });
      },
      deleteFolder: async (id) => {
        await api.folder.delete.mutate({ id });
      },
    };
  },
});

async function handle(req: NonNullable<ReturnType<typeof parseRequest>>): Promise<Response> {
  switch (req.kind) {
    case "status":
      return { ok: true, kind: "status", state: await custody.status() };
    case "heartbeat":
      // Surfaced in Settings so a session that silently restarted is visible.
      return { ok: true, kind: "heartbeat", count: ticks };
    case "unlock":
      await custody.unlock(req.email, req.password);
      startKeepAlive();
      return { ok: true, kind: "unlock" };
    case "lock":
      custody.lock();
      stopKeepAlive();
      return { ok: true, kind: "lock" };
    case "signOut":
      await custody.signOut();
      stopKeepAlive();
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
    case "itemsFull":
      return { ok: true, kind: "itemsFull", ...(await custody.itemsFull()) };
    case "deletedItems":
      return { ok: true, kind: "deletedItems", ...(await custody.deletedItems()) };
    case "folders":
      return { ok: true, kind: "folders", folders: await custody.folders() };
    case "saveItem":
      await custody.saveItem(req.id, req.item, req.isNew);
      return { ok: true, kind: "saveItem" };
    case "deleteItem":
      await custody.removeItem(req.id);
      return { ok: true, kind: "deleteItem" };
    case "restoreItem":
      await custody.restoreItem(req.id);
      return { ok: true, kind: "restoreItem" };
    case "saveFolder":
      await custody.saveFolder(req.id, req.name, req.isNew);
      return { ok: true, kind: "saveFolder" };
    case "deleteFolder":
      await custody.removeFolder(req.id);
      return { ok: true, kind: "deleteFolder" };
  }
}

/**
 * Holds the service worker awake for as long as the vault is unlocked.
 *
 * The previous attempt here was a timer that incremented a counter, on the
 * theory that an offscreen document with something to do would not be
 * collected. It did nothing: the document is torn down with the service worker
 * anyway, and the vault was locked again by the time the worker went idle.
 *
 * An open port is what actually works. Chrome keeps a service worker alive
 * while a port is connected, and traffic on it resets the idle timer, so
 * ticking every 20 seconds keeps both the worker and this document - and
 * therefore the key - alive across the eviction window.
 *
 * Only while unlocked. A locked vault has nothing worth preserving and should
 * let the worker be collected like any other extension.
 */
let port: chrome.runtime.Port | null = null;
let ticks = 0;

function startKeepAlive(): void {
  if (port) return;
  port = chrome.runtime.connect({ name: KEEPALIVE_PORT });
  port.onDisconnect.addListener(() => {
    port = null;
    // The worker was replaced. Reconnect so the session is not left exposed to
    // the next eviction, but only if the vault is still unlocked.
    void custody.status().then((state) => {
      if (state === "unlocked") startKeepAlive();
    });
  });
}

function stopKeepAlive(): void {
  port?.disconnect();
  port = null;
}

setInterval(() => {
  if (!port) return;
  ticks += 1;
  port.postMessage({ tick: ticks });
}, KEEPALIVE_INTERVAL_MS);

// The document may be recreated while the vault is still unlocked in it - it
// cannot be, in practice, but the check costs nothing and makes the invariant
// explicit: unlocked implies a live port.
void custody.status().then((state) => {
  if (state === "unlocked") startKeepAlive();
});

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
