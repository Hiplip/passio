import { describe, expect, it, vi } from "vitest";

import { keepOpenOnSpuriousFocusOut } from "./extension-popup";

function details(reason: string) {
  return { reason, cancel: vi.fn() };
}

/**
 * These run on a `node` document with no location, so IS_EXTENSION_PAGE is
 * false - which is exactly the web-app case worth pinning: the workaround must
 * change nothing outside an extension page.
 */
describe("keepOpenOnSpuriousFocusOut, off an extension page", () => {
  it("never cancels, whatever the reason", () => {
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
});
