# passio browser extension — design

**Date:** 2026-09-12
**Status:** approved, ready for planning
**Supersedes nothing.** Extends `2026-09-11-passio-design.md`, which remains the
authority on the crypto protocol and the web client.

## Goal

A Chrome extension that fills logins on the sites you visit, without weakening any
property the web client already holds. Specifically: the vault key stays
non-extractable, stays in memory, and never touches disk.

## Scope

**In:** sign-in, unlock, browse and search the vault, copy fields, match items to the
current site, fill username / password / one-time code on click, auto-lock.

**Out of v1, deliberately:** creating or editing items, folder management, signup,
recovery-key redemption, changing the master password, capturing new logins on submit
("save this password?"), offline access, cross-origin iframe filling, per-item URI
match strategies, Firefox and Safari.

The extension is a **read-and-fill client**. Anything that writes to the vault, or that
touches credentials themselves, stays in the web app — it is a much smaller surface to
get right, and those are not things you do from a toolbar popup. In particular the
extension **signs in but never signs up**: registration is closed after the first
account, so a signup path in the extension could only ever fail.

---

## Decisions

Each decision records what was rejected, because the rejected option is usually the
conventional one.

### D1 — The vault key lives in an offscreen document

MV3 evicts the service worker after roughly 30 seconds idle, destroying its heap. The
key has to live somewhere that survives that.

**Chosen:** a single offscreen document, created with reason `WORKERS`, holding the
`VaultKey` as a non-extractable `CryptoKey` in a module-level variable. Chrome's
reference states offscreen documents have no lifetime limit for any reason other than
`AUDIO_PLAYBACK`, and that their lifetime is independent of the service worker.

**Rejected — `chrome.storage.session`.** This is the conventional answer and it does
not work here without a real loss. `chrome.storage` serialises as JSON: a `CryptoKey`
is not serialisable, and an `ArrayBuffer` from `exportKey("raw")` serialises to `{}`.
The only usable form is a plain array of numbers, which requires marking the vault key
`extractable: true`. The existing design makes non-extractability load-bearing and
enforces it with branded types. Deleting that property to match a convention is
backwards.

**Rejected — no persistence, key scoped to the popup.** Argon2id at 64 MiB costs about
a second on every popup open. Unusable.

**Known risk.** Chrome's current reference says "no lifetime limits"; an older Chrome
blog post describing the API before launch said offscreen documents would be torn down
"when it stops performing actions" like an MV2 event page. The docs are in mild
tension and this is not testable on this machine. Mitigation, which is built
regardless: if the popup messages the offscreen document and gets no reply, it shows
the unlock screen. The failure mode degrades toward "derive again", never toward
exposure. Phase 3 exists to test this assumption on real Chrome before anything is
built on top of it.

### D2 — Chrome only

One key-custody implementation. Covers every Chromium browser. Firefox has no
offscreen API at all — its MV3 uses event pages, which do have DOM access, so the same
security property is reachable but through entirely different code. That fork would
land on the most security-critical component in the project, and could not be tested
here. If Firefox is wanted later, `packages/crypto`, `packages/core` and the popup all
carry over unchanged; only key custody forks.

### D3 — `activeTab`, not `<all_urls>`

The extension may touch a page only after the toolbar icon is clicked, and only that
tab.

Bitwarden and 1Password both ship `<all_urls>`, running a content script on every page
in order to offer inline icons inside password fields. This design gives that up. The
cost is near zero in practice: filling already requires opening the popup to choose an
item, so the click was happening anyway. What is lost is inline field icons and
automatic detection without a click.

What is gained: a bug in the fill logic cannot reach a page the extension was never
invoked on, and the extension has no standing read access to your bank or your email.

The badge showing how many saved logins match the current site needs only the `tabs`
permission (to read the active tab's URL), not host access.

A separate, narrow host permission is required for the API origin itself:
`https://passio-hiplip.vercel.app/*`. That is unrelated to page access. Note the
project also answers on the alias `passio-tau.vercel.app`; the extension should target
exactly one origin, and that origin must match `BETTER_AUTH_URL` in production, or the
bearer token will be issued for a host the extension never calls.

Incidentally `vercel.app` is itself on the public suffix list, so
`passio-hiplip.vercel.app` is its own registrable domain — the matching rules under
"Matching items to a site" handle it correctly for free.

### D3a — The exact permission set

Enumerated here because the manifest assertion test in phase 2 asserts this list
exactly, and "minimal" is not a testable word.

| Permission | Why | Reach |
|---|---|---|
| `offscreen` | Create the document that holds the key | Extension-internal |
| `storage` | Session token and auto-lock preference | Extension-internal |
| `alarms` | Auto-lock that survives worker eviction | Extension-internal |
| `idle` | Lock the vault when the system locks | Idle state only |
| `activeTab` | Touch the current tab, on click | One tab, after a click |
| `scripting` | Inject the fill function | Gated by `activeTab` |
| `tabs` | Read the active tab's URL for the badge | **Reads all tab URLs** |
| host: `https://passio-hiplip.vercel.app/*` | Reach the API | One origin |

`tabs` is the broadest of these and deserves naming: it lets the extension read the URL
of any tab, though not touch its content. It is required because the badge has to know
what site you are on *before* you click anything, and `activeTab` only grants access
after a click. Dropping `tabs` would mean dropping the badge.

`clipboardWrite` is deliberately **not** requested. `navigator.clipboard.writeText()`
works in the popup without it, given a user gesture and a focused document, which is
exactly the situation a copy button is in.

### D4 — Bearer token auth, stored on disk

The extension signs in independently: it derives `authHash` exactly as the web client
does, posts it to `/api/auth/sign-in/email`, and receives a token via the Better Auth
bearer plugin. The token is stored in `chrome.storage.local` — on disk, deliberately.

The reasoning is a consequence of the zero-knowledge design: **a session token is not
very sensitive here.** It buys an attacker ciphertext and nothing else. The vault key
is the secret, and it never touches disk. So you stay signed in across browser
restarts and still have to unlock, which is the correct behaviour.

**Rejected — session cookies.** A request from a `chrome-extension://` origin is
cross-site, so the session cookie would need `SameSite=None; Secure`, weakening CSRF
posture on the web app itself in order to serve the extension.

Server-side changes required: add `chrome-extension://<id>` to Better Auth
`trustedOrigins`, and CORS on the tRPC route.

### D5 — The manifest pins its `key`

Without a pinned `"key"`, the extension ID is regenerated on reload. The ID appears in
`trustedOrigins` and the CORS allowlist, so an unpinned ID means auth silently stops
working after a reload.

The manifest `"key"` field holds the **public** key and is safe to commit. The
corresponding `.pem` private key is what signs a packaged build — it must never be
committed, and `.gitignore` gains `*.pem` in phase 2.

### D6 — No `externally_connectable`

Because the extension signs in on its own, no web page ever needs to message it. The
entry is omitted entirely rather than scoped, removing the attack surface rather than
narrowing it. Every message handler additionally asserts
`sender.id === chrome.runtime.id`.

---

## Architecture

### Contexts and the trust boundary

```
┌─ chrome-extension://<pinned id> ──────────────────────────┐
│                                                            │
│  ┌────────────┐  messages   ┌──────────────────────────┐  │
│  │   Popup    │ ──────────▶ │   Offscreen document     │  │
│  │  (React)   │ ◀────────── │                          │  │
│  │            │  plaintext  │  • VaultKey (CryptoKey,  │  │
│  │ no key,    │             │    non-extractable)      │  │
│  │ no cipher  │             │  • Web Worker → Argon2id │  │
│  └────────────┘             │  • tRPC client → API     │  │
│        │                    │  • the ONLY holder       │  │
│        │ "fill this"        └──────────────────────────┘  │
│        ▼                              ▲                    │
│  ┌────────────┐   alarm/router        │                    │
│  │  Service   │ ──────────────────────┘                    │
│  │  worker    │  • chrome.alarms auto-lock                 │
│  │            │  • badge count, active tab URL             │
│  └────────────┘  • never sees key or plaintext             │
│        │                                                    │
└────────┼────────────────────────────────────────────────────┘
         │ chrome.scripting.executeScript (on user click only)
         ▼
   ┌──────────────┐
   │ Content      │  receives ONE field value, once.
   │ script       │  Never the key. Never the item. Never the vault.
   └──────────────┘
```

**The invariant:** the vault key exists in exactly one context, is never serialised,
and never crosses a message boundary. This mirrors the web client, where
`crypto-worker` derives and `VaultProvider` holds — relocated into a context MV3
cannot evict.

The content script receives a string, not an item. The worst case from a fill bug is
one wrong value typed into one field, on a page the user explicitly invoked.

The offscreen document owns the API client as well as the key, because it is the only
context that can do anything with ciphertext. The service worker is a router and an
alarm holder.

### Package layout

```
passio/
├── packages/
│   ├── crypto/          ← src/lib/crypto/* moved verbatim
│   └── core/            ← src/lib/items/* moved verbatim
├── apps/
│   ├── web/             ← today's Next app
│   └── extension/       ← WXT + React
```

`packages/crypto` moves **unchanged**: same files, same tests, same public barrel with
`deriveMasterKey`, `deriveAuthHash` and `stretchMasterKey` still deliberately absent.
A diff showing anything but moved paths means something went wrong.

`packages/core` takes `schema`, `totp`, `generator`, `actions`, `filter`, `search`,
`mask`, `decrypt-vault`, `decrypt-folders`, and `clipboard` (the popup needs the same
copy-with-auto-clear behaviour the web app has).

**Dependency direction is one-way: `core` depends on `crypto`, never the reverse.**
`decrypt-vault` and `decrypt-folders` are the only things in `core` that reach for it.
`crypto` keeps its current rule of importing nothing but `hash-wasm` and WebCrypto, and
that is what keeps it auditable in isolation.

The extension gets tRPC types via `import type { AppRouter } from "@passio/web/api"`.
Type-only, so no server code is bundled.

**Toolchain:** WXT (wxt.dev) for the extension — file-based entrypoints, generates the
manifest, HMR into content scripts.

---

## Behaviour

### Matching items to a site

`matchItemsToUrl(items, url) → Item[]` in `packages/core`. Pure. Ranked exact-host
first, then registrable domain.

Registrable domain is computed with the public suffix list (`tldts`). This is a
security requirement, not a correctness nicety: a naive "last two labels" rule treats
`alice.github.io` and `bob.github.io` as the same site, so a login for one is offered
on a page the other controls. The PSL knows `github.io` is itself a suffix. The same
applies to `vercel.app`, which this project deploys to.

Items with no URI, or a non-http(s) URI, never match — reusing the scheme check in
`launchUrlFor`. On `chrome://` and `file://` tabs, filling is disabled.

### Finding fields

`findLoginFields(document) → { username, password, totp }`. A pure function over a
DOM, which is what makes it testable without a browser.

**Password: exactly one visible password input, or do not fill.** Zero means it is not
a login form. Two or more means registration or change-password, where a wrong guess
is user-hostile. Bailing out is cheap — the popup falls back to copy.

**Visible** means: not `type=hidden`, not `disabled`, not `readonly`, and a non-zero
bounding box. **Invisible fields are never filled.** Hidden-field harvesting, where a
page plants an off-screen input to catch autofill, is a documented attack on password
managers.

**Username:** the nearest preceding visible text or email input in DOM order, with
`autocomplete="username"`, `type="email"`, or a `name`/`id` matching `user|email|login`
promoting a candidate.

**TOTP:** `autocomplete="one-time-code"`, or a `name`/`id` matching `otp|totp|2fa`.
Usually on the page after submit; when absent, the popup offers "copy code".

### Filling

Setting `el.value` does not update a React-controlled input — React tracks the value on
the node and overwrites it on the next render. The native setter must be used:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
setter.call(el, value);
el.dispatchEvent(new Event("input",  { bubbles: true }));
el.dispatchEvent(new Event("change", { bubbles: true }));
```

**Never auto-submit.** Fill, then the person clicks.

**`allFrames: false`.** No cross-origin iframe filling in v1. Some flows (certain banks,
some embedded OAuth) will not autofill and fall back to copy. That is much cheaper than
getting iframe filling wrong.

### Message protocol

A zod-validated discriminated union, checked at the offscreen boundary:

```ts
type Request =
  | { kind: "status" }                                     // locked | unlocked | signed-out
  | { kind: "unlock"; email: string; password: string }
  | { kind: "lock" }
  | { kind: "items" }                                      // decrypted, popup only
  | { kind: "fieldValue"; itemId: string; field: "username" | "password" | "totp" }
```

Every handler asserts `sender.id === chrome.runtime.id` first.

### Auto-lock

`chrome.alarms`, which survives service-worker eviction by design. Default 15 minutes
idle, reset on popup use and on a successful fill. The preference lives in
`chrome.storage.local` (not a secret). `chrome.idle` locks the vault when the system
locks. Closing the browser locks it for free, since the offscreen document dies.

### Error handling

| Failure | Behaviour |
|---|---|
| Offscreen document gone | Popup shows unlock |
| Session token expired (401) | Discard the key too; show sign-in |
| Wrong master password | Existing `DecryptionError` from `unwrapVaultKey` |
| Argon2id hangs | Existing 30s timeout in `crypto-worker/client.ts` |
| No login form found | "No login form on this page" plus copy buttons |
| Offline | Fails; no cache — see limitations |

### Deliberate limitations

**No offline access.** Bitwarden caches the encrypted vault to disk. That is a real
feature with its own threat model, and v1 does not do it. Nothing but the session token
and the auto-lock preference is written to disk — no plaintext, no ciphertext.

**No login capture.** v1 does not offer to save credentials on submit. Capture means
observing form submissions, which on `activeTab` is not possible anyway.

---

## Testing

### Covered by Vitest on this machine

| Unit | How |
|---|---|
| `packages/crypto` | Existing tests, moved unchanged |
| `packages/core` | Existing tests, moved unchanged |
| `matchItemsToUrl` | Pure; includes `alice.github.io` vs `bob.github.io`, `*.vercel.app`, `co.uk` |
| `findLoginFields` | jsdom fixtures: plain form, email+password, hidden honeypot, two-password signup, one-time-code page, fields outside any `<form>` |
| `fillField` | jsdom; asserts the native-setter path runs and both events fire |
| Message handlers | Pure over a request, with injected fakes — the seam `DerivationWorker` already uses |
| Key custody | Narrow interface, faked `chrome.*`; lock/unlock/timeout logic |

### NOT verifiable on this machine

There is no browser on this VPS and CLAUDE.md forbids installing one. None of the
following can be checked by the agent:

- **whether the offscreen document actually persists** (the load-bearing assumption)
- whether the manifest loads in Chrome
- whether bearer auth works from a `chrome-extension://` origin (CORS is easy to get
  subtly wrong)
- real autofill on real sites
- any popup rendering

### NEEDS-REVIEW: the smoke gate does not apply

CLAUDE.md makes `pnpm smoke` a required gate and states the gates are the only check on
unreviewed work. For the extension there is nothing to smoke, so that is no longer
true. Replaced by three things:

1. **Build gate** — `pnpm --filter extension build` produces a loadable unpacked build.
2. **Manifest assertion test** — parses the *generated* manifest and asserts the
   permission set is exactly the expected minimal one, the pinned `key` is present, and
   the CSP carries `wasm-unsafe-eval` (without which `hash-wasm` will not load).
   This catches permission creep, the most likely silent regression.
3. **A manual checklist run by the user**, once per phase, on their machine. Each
   extension phase therefore ends with a handoff, not a green tick.

The web app keeps all five gates unchanged.

---

## Phases

| # | Phase | Proves |
|---|---|---|
| 1 | **Monorepo split.** crypto + core into packages; web app behaviourally unchanged; Vercel root → `apps/web` | 354 tests still green, production still deploys |
| 2 | **Extension shell + sign-in.** WXT, pinned manifest, bearer token, "Locked" screen. Server: `trustedOrigins` + CORS | The extension can reach the API |
| 3 | **Offscreen custody + unlock + browse/copy.** Includes a fixed 15-minute auto-lock | **The persistence assumption, on real Chrome.** Already a useful product |
| 4 | **Site matching + badge.** Current-tab matching, count on the icon | Right items surface without searching |
| 5 | **Autofill.** `activeTab` + `scripting`, field detection, native-setter fill | The goal |
| 6 | **Auto-lock polish.** Configurable timeout, `chrome.idle` system lock, empty and error states | It behaves like a real password manager |

Two orderings are deliberate:

**Phase 3 retires the riskiest assumption early.** If offscreen documents do not persist
as documented, that must surface before autofill is built on them. Phase 3 is the
smallest thing that tests it for real.

**Phase 3 ships auto-lock even though phase 6 owns it.** No phase may leave a vault key
alive indefinitely.

**Phase 1 carries the deployment risk.** Changing the Vercel root directory is the
change most likely to break the live site, so it gets its own phase and fails alone.

Note that "shippable" changes meaning here. Phases 1 and 2 deploy to Vercel because
they touch the server. Phases 3–6 ship by being loaded unpacked in Chrome.

---

## Future, explicitly not now

- Login capture on submit (needs broader host permissions)
- Offline encrypted vault cache
- Per-item URI match strategies (exact / host / starts-with / regex)
- Inline field icons (needs `<all_urls>`)
- Firefox (event page instead of offscreen document)
- Chrome Web Store unlisted publication for auto-updates
