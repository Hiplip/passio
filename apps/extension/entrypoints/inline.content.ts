import { createOverlay } from "../src/inline/overlay";
import {
  applyFill,
  fillPayloadSchema,
  resizeMessageSchema,
  teardownMessageSchema,
} from "../src/inject";

/**
 * The inline suggestion overlay.
 *
 * `registration: "runtime"` keeps it out of the manifest: a declared content
 * script demands its host permission at install, and the point of this feature
 * is that a default install has no standing page access at all. The service
 * worker registers this only once someone opts in, and unregisters it the
 * moment the permission goes away.
 */
const GUARD = "__passioInlineInstalled";

export default defineContentScript({
  registration: "runtime",
  matches: [],
  main() {
    const w = window as unknown as Record<string, boolean>;
    if (w[GUARD]) return;
    w[GUARD] = true;

    const overlay = createOverlay();

    chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id) return false;

      if (teardownMessageSchema.safeParse(raw).success) {
        overlay.destroy();
        w[GUARD] = false;
        return false;
      }

      const resize = resizeMessageSchema.safeParse(raw);
      if (resize.success) {
        overlay.resize(resize.data.height);
        return false;
      }

      const parsed = fillPayloadSchema.safeParse(raw);
      if (!parsed.success) return false;

      const outcome = applyFill(parsed.data, document);
      // The list has served its purpose; leaving it open over a filled field
      // just hides what was filled.
      overlay.close();
      sendResponse(outcome);
      return false;
    });
  },
});
