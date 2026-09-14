/**
 * Whether this document is an extension page rather than a web page.
 *
 * Base UI popups close on `focus-out`, and inside a Chrome extension popup a
 * spurious focus-out fires immediately after the trigger is pressed - so a
 * Select or menu opens and closes again in the same frame. It is a known Base
 * UI bug (mui/base-ui#3546) with the same shape as radix-ui/primitives#2754,
 * and it makes every dropdown in the extension unusable.
 *
 * Detected rather than configured: the condition IS "this is an extension
 * page", so reading it off the protocol needs no wiring through the shared
 * components, and the web app's behaviour is untouched - closing on focus-out
 * is correct there, and a keyboard user tabbing away should still close it.
 */
export const IS_EXTENSION_PAGE =
  typeof location !== "undefined" && location.protocol === "chrome-extension:";

/**
 * Suppresses only the spurious close, leaving every other reason alone: a
 * click outside, Escape and choosing an item all still close the popup.
 */
export function keepOpenOnSpuriousFocusOut(
  open: boolean,
  details: { reason: string; cancel: () => void },
): void {
  if (!open && IS_EXTENSION_PAGE && details.reason === "focus-out") {
    details.cancel();
  }
}
