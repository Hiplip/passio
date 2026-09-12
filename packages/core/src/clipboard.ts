export const CLIPBOARD_CLEAR_MS = 30_000;

let pendingClear: ReturnType<typeof setTimeout> | null = null;

/**
 * Copies a secret and schedules the clipboard to be wiped.
 *
 * Returns false rather than throwing when the browser refuses - outside a
 * secure context, or without permission - so the UI can say "copy failed"
 * instead of leaving the user believing a password is on their clipboard when
 * it is not.
 *
 * A second copy cancels the first copy's pending wipe. Without that, copying
 * twice in quick succession would let the older timer clear the newer value.
 */
export async function copyWithAutoClear(value: string): Promise<boolean> {
  if (pendingClear !== null) {
    clearTimeout(pendingClear);
    pendingClear = null;
  }

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // No clear is scheduled: there is nothing of ours on the clipboard.
    return false;
  }

  pendingClear = setTimeout(() => {
    pendingClear = null;
    void navigator.clipboard.writeText("").catch(() => undefined);
  }, CLIPBOARD_CLEAR_MS);

  return true;
}
