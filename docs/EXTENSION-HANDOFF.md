# passio extension — acceptance checklist

Everything here needs a real browser, so none of it is covered by the automated gates.
Work top-down: the security section first, because a failure there means the extension
should not be used until it is fixed, and everything below assumes it passed.

**Load:** `chrome://extensions` → Developer mode → Load unpacked →
`apps/extension/.output/chrome-mv3/`
**Expected id:** `olifgfoaipigflfaiadpjalokaoonjjo`

---

## Already proven by the gates — do not spend time here

- Crypto: 526 automated tests, including AAD binding, recovery, and the KDF
- The manifest asks for exactly seven permissions, `<all_urls>` only as an opt-in, and
  declares no content scripts
- No derivation code in the popup, vault page, service worker or injected scripts
- The offscreen document's whole module graph uses no extension API but `chrome.runtime`
- CORS from the extension origin, verified against production with curl
- The web app's 9 routes, typecheck, lint and build

---

# A · Security — fix before using it for real

### A1 · One tenant's login is never offered on another's page

The single most important check. Shared-hosting platforms give every user a subdomain.

- [ ] Save a login for `passio-hiplip.vercel.app`
- [ ] Visit any **other** `*.vercel.app` site
- [ ] Badge shows nothing, "For this site" does not appear, and inline suggestions show
      "No saved logins"

Repeat with `*.github.io` if you have one. **A match here is a serious bug — stop and
report it.**

### A2 · Hidden fields are never filled

Pages plant off-screen inputs to harvest autofill. This is a documented attack.

- [ ] On any login page, open devtools and set a password field's parent to
      `display:none`, then add a second visible one
- [ ] Fill. Only the visible field should receive anything

### A3 · Change-password forms are refused

- [ ] Go to any "change your password" form (two or three password boxes)
- [ ] Fill from the popup → expect **"No login form on this page"**, and nothing typed

Guessing which box is which is how a password manager overwrites the wrong one.

### A4 · Nothing is ever submitted for you

- [ ] Fill a login. The form must **not** submit. You press the button

### A5 · A locked vault reveals nothing

- [ ] Lock the vault (Settings → Lock now)
- [ ] Click a field's passio button → "passio is locked", no titles, no usernames
- [ ] The toolbar badge shows no count

### A6 · The broad permission is genuinely revocable

The whole inline-suggestions design rests on this.

- [ ] Turn on **Settings → Suggest logins on form fields**, accept Chrome's prompt
- [ ] Confirm the in-field button appears on a login page
- [ ] `chrome://extensions` → passio → Details → **Site access → On click**
- [ ] Reload the login page: the button must be **gone, without restarting Chrome**
- [ ] The popup toggle now reads off

### A7 · The key dies with the browser

- [ ] Unlock, then quit Chrome completely and reopen
- [ ] The extension asks for your master password again

It must never come back unlocked. The key is memory-only by design.

---

# B · Core function

### B1 · Sign in and unlock

- [ ] First run: email + master password → "Unlocking…" for about a second → vault
- [ ] Lock, reopen: asks for the **master password only**, remembering the email
- [ ] Wrong password → a clear error, not a hang

### B2 · The key survives service-worker eviction

- [ ] Unlock, close the popup
- [ ] `chrome://extensions` → wait until passio reads **"service worker (Inactive)"**
- [ ] Open the popup → still unlocked

### B3 · Finding things

- [ ] Search matches on title, username and URL
- [ ] Search never matches a password (type a known password — expect no results)
- [ ] **Folder** filter, including "No folder"
- [ ] **Type** filter: Logins / Notes / Cards
- [ ] Filters combine with search, and with each other
- [ ] On a matching site, "For this site" appears above "All items"
- [ ] "For this site" disappears while a filter is active

### B4 · Copy

- [ ] `⋯` → Copy username / password / one-time code
- [ ] The one-time code matches your authenticator app
- [ ] **Wait 30 seconds, then paste** — the clipboard should have cleared

### B5 · Fill from the popup

- [ ] Ordinary login page: **Fill** populates both fields and the popup closes
- [ ] A **React-heavy site** — the value must stay, not blank itself a moment later
- [ ] A **two-step login** (Google, Microsoft): fills the email; the password page follows

### B6 · Inline suggestions

With the permission granted:

- [ ] A teal key button appears at the right of username **and** password fields
- [ ] Focusing a field opens the list without a click
- [ ] The list is the **same width as the field**, aligned to its left edge
- [ ] No scrollbar inside the list, and it does not cover the page below it
- [ ] Choosing an entry fills and closes
- [ ] The ↗ on a row opens that item in the vault window
- [ ] Escape closes it; clicking elsewhere closes it
- [ ] Scrolling keeps the button attached to its field

### B7 · Creating and editing

- [ ] **+ New** → pick a type → fill in → save → appears in the list **and in the web app**
- [ ] `⋯` → Edit → change something → save → reopen and confirm it stuck
- [ ] Generate a password inside the item form and save it
- [ ] Delete an item → it lands in Trash

### B8 · The vault window

- [ ] **↗** opens a window with **no tab strip and no address bar**
- [ ] Press ↗ again — it focuses the window you have, rather than opening a second
- [ ] Folders: create, move an item into one, rename
- [ ] Delete a folder → its items become **unfiled, not deleted**
- [ ] Trash: restore an item, confirm it returns to the list

### B9 · Generator

- [ ] Length slider, character-class switches, avoid-look-alikes
- [ ] Passphrase mode
- [ ] Copy, and confirm the clipboard clears after 30 seconds

### B10 · Auto-lock

- [ ] Set **Lock after** to 1 min, leave it, return → locked
- [ ] Lock your laptop screen and unlock → the vault is locked
- [ ] "Lock now" works immediately

---

# C · Edges and resilience

- [ ] **Offline:** turn off Wi-Fi and open the popup → "Cannot reach passio" with a retry,
      not a blank panel. There is no offline cache by design
- [ ] **A page with no login form:** Fill says so and leaves the copy actions available
- [ ] **A bank with an iframe login:** will not fill, by design. Copy still works
- [ ] **`chrome://extensions` or a PDF:** no button, no errors, popup still usable
- [ ] **Two browser windows:** unlock in one; the other is unlocked too (one offscreen
      document serves the whole browser)
- [ ] **An item with no password**, or no username: copy offers only what exists
- [ ] **A very long folder name** in the filter dropdown — should truncate, not overflow
- [ ] **A vault with one item, and with none:** empty states read sensibly

---

# D · The web app still works

The repo was restructured several times. This is where your real vault lives.

- [ ] Log in, unlock, all items present
- [ ] Open an item, reveal and copy a password
- [ ] A TOTP code appears and counts down
- [ ] Create and delete a throwaway item
- [ ] Folders, category filters, trash
- [ ] Settings and the security page

---

# E · What stays unverifiable

Honest limits, not oversights:

- **Recovery-key redemption**, changing the master password and signup are web-app only.
  Test those in the web app; the extension deliberately cannot do them
- **Safari and Firefox** are not supported. Safari needs a native macOS wrapper; Firefox
  has no offscreen API and would need a second key-custody implementation
- **No offline access.** Nothing but the session token and your lock preference is
  written to disk — no plaintext, no ciphertext
- **No "save this password?" prompt** on new logins. That needs to observe form
  submissions, which `activeTab` does not allow

---

# F · If something fails

Three places carry everything I need:

- **Popup:** right-click the popup → Inspect → Console
- **Service worker:** `chrome://extensions` → the "service worker" link
- **A page's own console** (F12) for anything involving the in-field button

If a dropdown flashes open and shut, the console prints one line naming the close
reason — paste that. It is the difference between a ten-second answer and an afternoon
of guessing.
