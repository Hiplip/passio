/** Roughly a laptop-friendly working size; Chrome clamps it to the display. */
const WIDTH = 1000;
const HEIGHT = 760;

function vaultUrl(path: string): string {
  return chrome.runtime.getURL(`vault.html#${path === "/" ? "/vault" : path}`);
}

/**
 * Opens the vault in a detached window.
 *
 * `type: "popup"` rather than a tab: it has no tab strip and no address bar, so
 * it reads as an application window rather than a web page, and the
 * chrome-extension:// URL is never on show. It also survives losing focus,
 * which the toolbar popup does not - Chrome closes that the instant you click
 * anything behind it, which is hostile to a long edit.
 *
 * An already-open window is focused rather than duplicated, so repeatedly
 * hitting the button does not litter the desktop.
 */
export async function popOut(path: string): Promise<void> {
  const url = vaultUrl(path);
  const prefix = chrome.runtime.getURL("vault.html");

  const existing = await chrome.windows.getAll({ populate: true });
  for (const win of existing) {
    const tab = win.tabs?.find((t) => t.url?.startsWith(prefix));
    if (tab?.id && win.id !== undefined) {
      // Move it to the requested screen, then raise it.
      await chrome.tabs.update(tab.id, { url });
      await chrome.windows.update(win.id, { focused: true });
      return;
    }
  }

  await chrome.windows.create({ url, type: "popup", width: WIDTH, height: HEIGHT });
}
