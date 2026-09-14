import { describe, expect, it, vi } from "vitest";

import {
  ALIGN_ITEM_WITH_TRIGGER,
  IS_EXTENSION_PAGE,
  keepOpenOnSpuriousFocusOut,
  reportSuspiciousClose,
} from "./extension-popup";

function details(reason: string) {
  return { reason, cancel: vi.fn() };
}

/**
 * These run on a `node` environment with no location, so IS_EXTENSION_PAGE is
 * false - which is exactly the web-app case worth pinning down: none of this
 * may change behaviour outside an extension page.
 */
describe("off an extension page", () => {
  it("knows it is not one", () => {
    expect(IS_EXTENSION_PAGE).toBe(false);
  });

  it("keeps the native select-style trigger overlap", () => {
    // The web app's Select is meant to overlap its trigger like a native
    // select; only the extension popup cannot cope with it.
    expect(ALIGN_ITEM_WITH_TRIGGER).toBe(true);
  });

  it("never cancels a close, whatever the reason", () => {
    for (const reason of ["focus-out", "outside-press", "escape-key", "item-press"]) {
      const d = details(reason);
      keepOpenOnSpuriousFocusOut(false, d);
      expect(d.cancel, reason).not.toHaveBeenCalled();
    }
  });

  it("never cancels an opening event", () => {
    const d = details("focus-out");
    keepOpenOnSpuriousFocusOut(true, d);
    expect(d.cancel).not.toHaveBeenCalled();
  });

  it("stays quiet about fast closes", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    reportSuspiciousClose(true, "trigger-press");
    reportSuspiciousClose(false, "item-press");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
