# Inline Autofill Overlay Implementation Plan

**Goal:** A passio icon inside login fields, and a suggestion list anchored to the
field that fills on click — without the extension gaining standing access to every
page by default.

**Architecture:** `<all_urls>` becomes an *optional* host permission, off at install.
A toggle requests it; only then is the content script registered at runtime. The
suggestion list renders in an iframe on the extension's origin, so page scripts cannot
read it. Secrets never enter the page's DOM — the list shows titles and usernames, and
a password travels only on an explicit click, straight into the field.

---

## Why optional permissions

Spec D3 chose `activeTab` over `<all_urls>` deliberately: a bug in fill logic cannot
reach a page the extension was never invoked on, and the extension has no standing read
access to your bank or your email.

Inline suggestions cannot work under `activeTab` — the icon has to exist *before* any
click. Rather than reverse D3, the permission becomes opt-in:

| | Default install | After opting in |
|---|---|---|
| Standing page access | none | every page |
| Inline icon | no | yes |
| Click-to-fill from popup | yes | yes |

`chrome.permissions.request` must be called from a user gesture, and Chrome shows its
own consent prompt. Revoking in `chrome://extensions` unregisters the script.

## Why an iframe and not a shadow root

A closed shadow root is still reachable from the page in practice, and an open one
trivially so. An iframe on `chrome-extension://<id>` is a different origin: page script
cannot read its DOM, its styles, or what is selected in it.

Cost: it needs `web_accessible_resources`, which exposes that one page's URL to sites.
That is acceptable — the page renders nothing until the extension messages it, and
knowing the extension's id is not a secret (the manifest key is public).

---

# PHASE 1 — Permission plumbing

**Proves:** the extension can gain and lose page access at runtime, with nothing
registered until it does.

### Task 1: Declare the optional permission

- [ ] `wxt.config.ts`: add `optional_host_permissions: ["<all_urls>"]`. Leave
      `host_permissions` as the single API origin.
- [ ] `manifest.test.ts`: assert `optional_host_permissions` is exactly
      `["<all_urls>"]`, and that `host_permissions` still contains no wildcard. The
      existing "never requests broad host access" test must keep passing — the point is
      that the broad grant is *optional*, never standing.

### Task 2: A module that owns the grant

- [ ] `src/inline-permission.ts`:
      ```ts
      export const INLINE_ORIGINS = { origins: ["<all_urls>"] };
      export function hasInlineAccess(): Promise<boolean>;
      export function requestInlineAccess(): Promise<boolean>;  // user gesture only
      export function dropInlineAccess(): Promise<boolean>;
      ```
- [ ] Tests with a faked `chrome.permissions`, covering: granted, refused, revoked.

### Task 3: Register and unregister at runtime

- [ ] `src/inline-script.ts`: `syncInlineScript()` — registers
      `content-scripts/inline.js` via `chrome.scripting.registerContentScripts` when
      the permission is held, unregisters it when not.
- [ ] The service worker calls it on `runtime.onStartup`, `runtime.onInstalled`, and
      `chrome.permissions.onAdded` / `onRemoved`, so revoking in `chrome://extensions`
      takes effect without a reload.
- [ ] Tests with a faked `chrome.scripting`.

### Task 4: The toggle

- [ ] A row in the popup footer: "Suggest logins in password fields".
- [ ] On enable, call `requestInlineAccess()` from the click handler — Chrome refuses
      the prompt outside a user gesture, so it cannot be moved into an effect.
- [ ] Reflect the real permission state on open, not a stored preference: the user can
      revoke it in `chrome://extensions` and the toggle must tell the truth.

---

# PHASE 2 — The overlay

**Proves:** the goal.

### Task 5: Field decoration

- [ ] `src/inline/decorate.ts` — given the `LoginFields` already found by
      `findLoginFields`, place a button over the right-hand end of each field.
- [ ] Position with a fixed-position element tracking `getBoundingClientRect`, updated
      on `scroll`, `resize` and a `ResizeObserver`. Absolutely positioned children
      inside the page's own layout break on too many sites.
- [ ] Never decorate a field the page cannot see, reusing the visibility rule that
      already refuses hidden fields.

### Task 6: The suggestion iframe

- [ ] `entrypoints/inline/index.html` + `main.tsx` → `inline.html`, listed in
      `web_accessible_resources`.
- [ ] Renders matching items for the page's URL: **title and username only.**
- [ ] Sized and positioned by the content script; communicates over
      `chrome.runtime` messages, never `postMessage` to the page.

### Task 7: Fill on selection

- [ ] Selecting an entry messages the offscreen document for the three values, which
      go to the content script and into the fields via the existing `fillField`.
- [ ] The iframe never receives a password — only the content script does, and only
      for the item just chosen.
- [ ] Locked vault: the list shows "Unlock passio" and opens the popup instead.

### Task 8: Lifecycle

- [ ] `MutationObserver` re-runs detection when the page swaps its form, which every
      SPA login does.
- [ ] Dismiss on `Escape`, on outside click, and on scroll away.
- [ ] Remove all decoration when the permission is revoked or the vault locks.

---

# PHASE 3 — Gates and handoff

- [ ] `bundle.test.ts`: the inline page and content script link no derivation, and the
      inline script is present at the registered path.
- [ ] A jsdom test for `decorate.ts` proving it never decorates a hidden field.
- [ ] `DECISIONS.md`: record the optional-permission model against spec D3.
- [ ] `docs/EXTENSION-HANDOFF.md`: how to enable, and how to revoke.
