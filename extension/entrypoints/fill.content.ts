import { applyFill, fillPayloadSchema } from "../src/inject";

/** Injecting the same file twice would register a second listener, and both
 *  would try to answer. Chrome keeps the first reply and warns about the rest. */
const GUARD = "__passioFillListenerInstalled";

/**
 * Injected on demand, never declared in the manifest.
 *
 * `registration: "runtime"` keeps this out of `content_scripts`, which is what
 * lets the extension stay on activeTab: a declared content script needs host
 * permissions for every site it could ever run on. This one exists on a tab
 * only after chrome.scripting.executeScript puts it there, which activeTab
 * allows only after the toolbar icon is clicked.
 */
export default defineContentScript({
  registration: "runtime",
  matches: [],
  main() {
    const w = window as unknown as Record<string, boolean>;
    if (w[GUARD]) return;
    w[GUARD] = true;

    chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id) return false;
      const parsed = fillPayloadSchema.safeParse(raw);
      if (!parsed.success) return false;
      sendResponse(applyFill(parsed.data, document));
      return false;
    });
  },
});
