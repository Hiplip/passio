import { clearToken, readToken, writeToken } from "../src/auth";
import { chromeTokenStore } from "../src/chrome-storage";
import type { FillOutcome, FillPayload } from "../src/inject";
import {
  forwarded,
  parseBackgroundRequest,
  type BackgroundResponse,
  type OutboundRequest,
  type Response,
} from "../src/messages";
import { syncInlineScript, type ScriptingApi } from "../src/inline-script";
import { KEEPALIVE_PORT } from "../src/keepalive";
import { LOCK_MINUTES_KEY, normaliseLockMinutes } from "../src/prefs";

const OFFSCREEN_PATH = "offscreen.html";
const LOCK_ALARM = "passio.auto-lock";

/**
 * Ensures the one document that holds the vault key exists.
 *
 * Chrome allows exactly one offscreen document per extension and throws on a
 * second. Two popup opens can race here, so the in-flight promise is shared
 * rather than the existence check simply being repeated.
 */
let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existing.length > 0) return;

  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS"],
      justification:
        "Runs Argon2id in a Web Worker and holds the vault key in memory, " +
        "which a service worker cannot do because MV3 evicts it.",
    })
    .finally(() => {
      creating = null;
    });

  await creating;
}

/** chrome.alarms outlives service-worker eviction; setTimeout does not. That is
 *  the entire reason auto-lock lives here and not in the offscreen document. */
async function resetLockAlarm(): Promise<void> {
  const stored = await chrome.storage.local.get(LOCK_MINUTES_KEY);
  const minutes = normaliseLockMinutes(stored[LOCK_MINUTES_KEY]);
  await chrome.alarms.clear(LOCK_ALARM);
  await chrome.alarms.create(LOCK_ALARM, { delayInMinutes: minutes });
}

/**
 * Resolves an item's values and sends them to the content script in one tab.
 *
 * The three strings are the only thing that crosses into page-adjacent code -
 * never the item, never the key. Same contract the popup's fill path uses.
 */
async function fillTab(tabId: number, itemId: string): Promise<FillOutcome> {
  await ensureOffscreen();

  const ask = async (field: "username" | "password" | "totp") => {
    const res: Response = await chrome.runtime.sendMessage(
      forwarded({ target: "offscreen", kind: "fieldValue", itemId, field }),
    );
    return res.ok && res.kind === "fieldValue" ? res.value : "";
  };

  const payload: FillPayload = {
    kind: "fill",
    username: await ask("username"),
    password: await ask("password"),
    totp: await ask("totp"),
  };

  const outcome: FillOutcome = await chrome.tabs.sendMessage(tabId, payload);
  await resetLockAlarm();
  return outcome;
}

async function updateBadge(tabId: number, url: string | undefined): Promise<void> {
  let count = 0;
  if (url?.startsWith("http")) {
    try {
      await ensureOffscreen();
      const res: Response = await chrome.runtime.sendMessage(
        forwarded({ target: "offscreen", kind: "matchCount", url }),
      );
      if (res.ok && res.kind === "matchCount") count = res.count;
    } catch {
      count = 0; // locked, or no offscreen document
    }
  }
  await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
  // Ink, matching the mark in the popup and the one on every login form.
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#221f2b" });
}

/** chrome.scripting, as the narrow interface syncInlineScript expects. */
const scripting: ScriptingApi = {
  getRegisteredContentScripts: () => chrome.scripting.getRegisteredContentScripts(),
  registerContentScripts: (s) => chrome.scripting.registerContentScripts(s),
  unregisterContentScripts: (f) => chrome.scripting.unregisterContentScripts(f),
};

export default defineBackground(() => {
  /**
   * Keep the inline content script in step with the permission.
   *
   * onAdded/onRemoved matter as much as startup: revoking access from
   * chrome://extensions fires them, and without this the script would keep
   * running on every page until the next browser restart.
   */
  const sync = () => void syncInlineScript(scripting);
  sync();
  chrome.runtime.onInstalled.addListener(sync);
  chrome.permissions.onAdded.addListener(sync);

  chrome.runtime.onStartup.addListener(() => {
    sync();
    // A profile that has just started must never begin unlocked, whatever
    // survived the shutdown.
    void chrome.runtime
      .sendMessage(forwarded({ target: "offscreen", kind: "lock" }))
      .catch(() => undefined);
  });

  chrome.permissions.onRemoved.addListener(() => {
    sync();
    // Unregistering stops NEW injections; Chrome cannot pull already-running
    // script out of a page that is already open. Without this the in-field
    // button lingers on every open tab until each one is reloaded, which makes
    // revoking access look like it did not work.
    void (async () => {
      const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
      const ids = tabs
        .map((t) => t.id)
        .filter((id): id is number => id !== undefined);

      await Promise.all(
        // A tab with no injected script simply has no receiver; that rejection
        // is the normal case, not a failure.
        ids.map((id) =>
          chrome.tabs
            .sendMessage(id, { kind: "passio-teardown" })
            .catch(() => undefined),
        ),
      );
    })();
  });

  /**
   * Storage on behalf of the offscreen document.
   *
   * An offscreen document's only extension API is chrome.runtime, so it cannot
   * reach chrome.storage itself. This worker holds the session token for it.
   * Only the token crosses - never the vault key.
   */
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    const req = parseBackgroundRequest(raw);
    if (!req) return false;

    void (async (): Promise<BackgroundResponse> => {
      switch (req.kind) {
        case "tokenRead":
          return {
            ok: true,
            kind: "tokenRead",
            token: await readToken(chromeTokenStore),
          };
        case "tokenWrite":
          await writeToken(chromeTokenStore, req.token);
          return { ok: true, kind: "tokenWrite" };
        case "tokenClear":
          await clearToken(chromeTokenStore);
          return { ok: true, kind: "tokenClear" };
        case "inlineResize": {
          // Relayed to the content script in the iframe's own tab, which the
          // worker knows from `sender` and the iframe cannot forge.
          const tabId = sender.tab?.id;
          if (tabId !== undefined) {
            await chrome.tabs.sendMessage(tabId, {
              kind: "passio-resize",
              height: req.height,
            });
          }
          return { ok: true, kind: "inlineResize" };
        }
        case "inlineFill": {
          // The tab comes from `sender`, never from the message: the iframe is
          // on our origin but sits inside a page, and a tab id it supplied
          // would let a hostile page aim a fill at a tab it does not own.
          const tabId = sender.tab?.id;
          if (tabId === undefined) throw new Error("No tab to fill.");
          return {
            ok: true,
            kind: "inlineFill",
            outcome: await fillTab(tabId, req.itemId),
          };
        }
      }
    })()
      .then(sendResponse)
      .catch((e: unknown) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : "Storage failed.",
        } satisfies BackgroundResponse),
      );

    return true;
  });

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;

    const req = raw as Partial<OutboundRequest> & { via?: string };
    if (req?.target !== "offscreen") return false;
    // Already forwarded: this is our own copy coming back round the broadcast.
    // Handling it again would loop.
    if (req.via === "background") return false;

    void (async () => {
      await ensureOffscreen();
      const res: Response = await chrome.runtime.sendMessage(
        forwarded(req as OutboundRequest),
      );

      // Any successful interaction is activity: push the idle deadline out.
      if (res.ok && req.kind !== "status" && req.kind !== "matchCount") {
        await resetLockAlarm();
      }
      if (res.ok && (req.kind === "lock" || req.kind === "signOut")) {
        await chrome.alarms.clear(LOCK_ALARM);
      }

      sendResponse(res);
    })().catch(() =>
      // A missing offscreen document lands here. The popup reads a failure as
      // "locked" and shows the unlock screen, which is the right degradation.
      sendResponse({ ok: false, error: "The vault is locked." } satisfies Response),
    );

    return true;
  });

  /**
   * Lock when the last browser window closes.
   *
   * Closing every window does NOT end the browser process - Chrome and Brave
   * both keep running in the background, and MV3 keeps the extension alive with
   * them, so the offscreen document and the vault key survive. Reopening then
   * lands you in an unlocked vault, which is not what "closing the browser ends
   * access" is supposed to mean.
   *
   * This makes the promise true regardless of whether the process actually
   * exits.
   */
  chrome.windows.onRemoved.addListener(() => {
    void (async () => {
      const remaining = await chrome.windows.getAll();
      if (remaining.length > 0) return;
      await chrome.alarms.clear(LOCK_ALARM);
      await chrome.runtime.sendMessage(forwarded({ target: "offscreen", kind: "lock" }));
    })().catch(() => {
      // No offscreen document to tell: it is already gone, which is locked.
    });
  });

  /**
   * The offscreen document holds this port open while the vault is unlocked.
   *
   * A connected port keeps the service worker alive, and traffic on it resets
   * the idle timer - which is what keeps the offscreen document, and the vault
   * key inside it, from being collected 30 seconds after you stop typing. The
   * worker does not need to do anything with the ticks; receiving them is the
   * whole point.
   */
  chrome.runtime.onConnect.addListener((connected) => {
    if (connected.name !== KEEPALIVE_PORT) return;
    connected.onMessage.addListener(() => {
      // Deliberately empty. The message existing is what resets the timer.
    });
  });

  /**
   * Rebuild the alarm when the lock timeout is changed.
   *
   * Without this the setting only took effect at the next vault interaction:
   * changing it to a minute and walking away left the old delay running, so it
   * looked as though auto-lock had simply stopped working.
   */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(LOCK_MINUTES_KEY in changes)) return;
    void resetLockAlarm();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== LOCK_ALARM) return;
    void chrome.runtime.sendMessage(forwarded({ target: "offscreen", kind: "lock" }));
  });

  // Locking the laptop should lock the vault. Waiting out the idle timer after
  // someone has deliberately locked their screen defeats the point.
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === "locked") {
      void chrome.runtime.sendMessage(forwarded({ target: "offscreen", kind: "lock" }));
    }
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs.get(tabId).then((t) => updateBadge(tabId, t.url));
  });

  chrome.tabs.onUpdated.addListener((tabId, changed, tab) => {
    if (changed.status === "complete") void updateBadge(tabId, tab.url);
  });
});
