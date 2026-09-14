/** Every page, requested only when someone turns inline suggestions on. */
export const INLINE_ORIGINS: chrome.permissions.Permissions = {
  origins: ["<all_urls>"],
};

/** The slice of chrome.permissions this module uses, injected so it is testable
 *  with no browser. */
export interface PermissionApi {
  contains(p: chrome.permissions.Permissions): Promise<boolean>;
  request(p: chrome.permissions.Permissions): Promise<boolean>;
  remove(p: chrome.permissions.Permissions): Promise<boolean>;
}

const chromePermissions: PermissionApi = {
  contains: (p) => chrome.permissions.contains(p),
  request: (p) => chrome.permissions.request(p),
  remove: (p) => chrome.permissions.remove(p),
};

export function hasInlineAccess(api: PermissionApi = chromePermissions): Promise<boolean> {
  return api.contains(INLINE_ORIGINS);
}

/**
 * Asks for access to every page.
 *
 * **Must be called directly from a user gesture.** Chrome silently refuses the
 * prompt otherwise, so this cannot move into an effect or a promise chain that
 * has already yielded.
 */
export function requestInlineAccess(
  api: PermissionApi = chromePermissions,
): Promise<boolean> {
  return api.request(INLINE_ORIGINS);
}

/** Gives it back. The content script is unregistered by the permission
 *  listener, not here, so revoking from chrome://extensions behaves the same. */
export function dropInlineAccess(
  api: PermissionApi = chromePermissions,
): Promise<boolean> {
  return api.remove(INLINE_ORIGINS);
}
