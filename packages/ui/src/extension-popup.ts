/**
 * Whether this document is an extension page rather than a web page.
 *
 * Detected rather than configured: the condition genuinely is "this is an
 * extension page", so it needs no wiring through the components `vault-ui`
 * shares with the web app, and web behaviour stays untouched.
 */
export const IS_EXTENSION_PAGE =
  typeof location !== "undefined" && location.protocol === "chrome-extension:";

/**
 * Base UI's Select overlaps its trigger by default (`alignItemWithTrigger`),
 * putting the selected item directly under the cursor so its text lines up
 * with the trigger's - the way a native select behaves.
 *
 * Inside a Chrome extension popup that turns a single click into open-then-
 * choose: the popup appears on mousedown with an item beneath the pointer, and
 * the mouseup that follows lands on that item, selects it and closes again.
 * The dropdown visibly flashes and is unusable.
 *
 * Below-the-trigger placement puts the mouseup back on the trigger, where it
 * does nothing. It is also the better shape for a filter dropdown regardless.
 */
export const ALIGN_ITEM_WITH_TRIGGER = !IS_EXTENSION_PAGE;

/**
 * Suppresses a spurious `focus-out` close, which extension pages also emit
 * right after a trigger is pressed. Every other reason is left alone: an
 * outside press, Escape and choosing an item all still close the popup.
 */
export function keepOpenOnSpuriousFocusOut(
  open: boolean,
  details: { reason: string; cancel: () => void },
): void {
  if (!open && IS_EXTENSION_PAGE && details.reason === "focus-out") {
    details.cancel();
  }
}

const SUSPICIOUS_MS = 250;
let openedAt = 0;

/**
 * Reports a popup that closed almost as soon as it opened.
 *
 * Extension popups have a history of breaking Base UI's dismissal in ways no
 * test on a machine without a browser can reproduce - jsdom renders the same
 * markup happily. One console line naming the reason turns the next instance
 * of this from an afternoon of guessing into a ten-second answer.
 */
export function reportSuspiciousClose(open: boolean, reason: string): void {
  if (!IS_EXTENSION_PAGE) return;
  if (open) {
    openedAt = Date.now();
    return;
  }
  const elapsed = Date.now() - openedAt;
  if (openedAt !== 0 && elapsed < SUSPICIOUS_MS) {
    console.warn(
      `[passio] popup closed ${elapsed}ms after opening, reason: ${reason}. ` +
        "If a dropdown is flashing, this is why.",
    );
  }
  openedAt = 0;
}
