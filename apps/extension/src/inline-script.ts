import { hasInlineAccess, type PermissionApi } from "./inline-permission";

export const INLINE_SCRIPT_ID = "passio-inline";
const INLINE_SCRIPT_FILE = "content-scripts/inline.js";

/** The slice of chrome.scripting this module uses, injected for testing. */
export interface ScriptingApi {
  getRegisteredContentScripts(): Promise<{ id: string }[]>;
  registerContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
}

/**
 * Keeps the inline content script registered exactly when the permission is held.
 *
 * Registration is done at runtime rather than declared in the manifest, because
 * a declared content script would demand its host permission at install. This
 * way the default install has no standing page access at all, and the script
 * only begins to exist once someone opts in.
 *
 * Called on startup, on install, and from the permission listeners - so
 * revoking access in chrome://extensions takes effect immediately, without a
 * reload.
 */
export async function syncInlineScript(
  scripting: ScriptingApi,
  permissions?: PermissionApi,
): Promise<boolean> {
  const wanted = await hasInlineAccess(permissions);
  const registered = (await scripting.getRegisteredContentScripts()).some(
    (s) => s.id === INLINE_SCRIPT_ID,
  );

  if (wanted && !registered) {
    await scripting.registerContentScripts([
      {
        id: INLINE_SCRIPT_ID,
        js: [INLINE_SCRIPT_FILE],
        matches: ["http://*/*", "https://*/*"],
        runAt: "document_idle",
        // Top frame only. Cross-origin iframe filling is out of scope, and a
        // login form inside someone else's frame is exactly where getting this
        // wrong would be worst.
        allFrames: false,
      },
    ]);
  } else if (!wanted && registered) {
    await scripting.unregisterContentScripts({ ids: [INLINE_SCRIPT_ID] });
  }

  return wanted;
}
