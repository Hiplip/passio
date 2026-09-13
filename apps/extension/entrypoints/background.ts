import { chromeTokenStore, clearToken, readToken, writeToken } from "../src/auth";
import {
  forwarded,
  parseBackgroundRequest,
  type BackgroundResponse,
  type OutboundRequest,
  type Response,
} from "../src/messages";
import { normaliseLockMinutes } from "../src/prefs";

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
  const stored = await chrome.storage.local.get("passio.lock-minutes");
  const minutes = normaliseLockMinutes(stored["passio.lock-minutes"]);
  await chrome.alarms.clear(LOCK_ALARM);
  await chrome.alarms.create(LOCK_ALARM, { delayInMinutes: minutes });
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
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#18181b" });
}

export default defineBackground(() => {
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
