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

### A2 + A3 · Use the test pages

`docs/autofill-test/` holds one scenario per page. That split is deliberate: passio
applies its safety rule to the **whole document** — exactly one visible password field,
or it fills nothing — so a single page containing every case makes that rule refuse all
of them and tests nothing.

Copy the folder down:

```powershell
scp -r you@your-dev-box:/home/dev/projects/passio/docs/autofill-test D:\Downloads\
```

**Serve it over HTTP — `file://` cannot work**, and not for want of a setting. Three
deliberate rules block it: `matchItemsToUrl` refuses any non-http(s) URL (the same rule
that stops a stored `javascript:` URI becoming launchable), the popup refuses to fill a
non-http tab, and the inline content script is registered for `http://*/*` and
`https://*/*` only.

```powershell
npx --yes http-server D:\Downloads\autofill-test -p 8080
# then open http://localhost:8080/
```

(`python -m http.server 8080` from that folder does the same job.)

**Make one throwaway item first**, so there is something to fill with:

- Title `Autofill test`, username `test@example.com`, any password
- **URL: `http://localhost:8080`** — this is what puts it under "For this site" and in
  the inline suggestion list

Then work through the pages:

**Each page says PASS or FAIL at the bottom as you fill it.** Nothing to check in a
console: a box at the foot of every page watches the fields, including the hidden ones,
and turns green or red. It polls rather than listening for events, so a fill that
silently failed to dispatch them still shows up.

- [ ] **1 Ordinary login** — both fields filled. The baseline; if this fails, nothing
      below means anything
- [ ] **2 Hidden password trap** — green. Red means the off-screen field was filled
- [ ] **3 Hidden username trap** — green
- [ ] **4 Change password** — **refuses**, and the box stays green because nothing was
      typed
- [ ] **5 Two-step login** — fills the email only
- [ ] **6 Search box** — judged by eye: no passio button at the right of the field
- [ ] **7 Disabled and read-only** — neither is filled or decorated

Pages 2, 3 and 4 are the security ones. Planting an off-screen input to harvest autofill
is a documented attack, and guessing which box is which on a change-password form is how
a manager overwrites the wrong password.

For pages 1-5 you can also just pick any item in the popup and press **Fill** — a
matching URL is only needed for the "For this site" group and the inline list. Delete
the throwaway item and stop the server when you are done.

---

# B · Core function

### B1 · Sign in and unlock

- [ ] First run: email + master password → "Unlocking…" for about a second → vault
- [ ] Lock, reopen: asks for the **master password only**, remembering the email
- [ ] Wrong password → a clear error, not a hang

### B2 · The vault stays unlocked while you are away (~90 seconds)

**The 60 minutes below is a setting, not a wait.** It only stops auto-lock from
interfering; the test itself takes about a minute and a half.

- [ ] Settings → **Lock after → 60 min**
- [ ] Unlock, then close the popup
- [ ] Leave it alone for **90 seconds** — do not open the popup, do not click the icon
- [ ] Open the popup → **still unlocked**

That is the whole test. Chrome evicts an idle service worker after roughly 30 seconds,
so 90 is comfortably past the window that used to lose your key.

**Do not open the worker's DevTools to watch it.** Attaching a debugger keeps a service
worker alive, so the test would pass for the wrong reason. Any check you can do by
inspecting is a check you are no longer running.

Optional, and only if you are curious: on `chrome://extensions` the card should now say
**"service worker"** rather than **"service worker (Inactive)"** while the vault is
unlocked. That is the fix working - the offscreen document holds a port open, which is
what keeps the worker, the document and the key from being collected. Lock the vault and
it goes idle again like any other extension.

### B3 · Finding things

- [ ] Search matches on title, username and URL
- [ ] Search never matches a password (type a known password — expect no results)
- [ ] **Folder** filter, including "No folder"
- [ ] **Type** filter: Logins / Notes / Cards
- [ ] Filters combine with search, and with each other
- [ ] On a matching site, "For this site" appears above "Everything else"
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

- [ ] A small dark circle carrying the passio dial appears at the right of username
      **and** password fields, and turns violet on hover
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

- [ ] Set **Lock after** to 1 min, close the popup, wait 90 seconds without touching it,
      reopen → locked
- [ ] Set it to 15 min, use the vault, and confirm it does **not** lock while you work
- [ ] Lock your laptop screen and unlock → the vault is locked
- [ ] "Lock now" works immediately

Changing the timeout used to do nothing until the next vault interaction, so setting it
to a minute and walking away left the previous delay running. The worker now rebuilds
the alarm the moment the setting changes.

Any use of the vault resets the countdown, by design - the timeout is idle time, not
total session time.

---

# C · Edges and resilience (~10 min)

Each of these has a concrete way to produce it.

### C1 · Offline

- [ ] Turn off Wi-Fi (or Airplane mode), then open the popup and unlock or list items
- [ ] Expect **"Cannot reach passio"** with a **Try again** button — not a blank panel
      and not a spinner that never ends
- [ ] Turn Wi-Fi back on, press Try again → it recovers

There is no offline cache by design, so failing is correct here. Failing *silently* is not.

### C2 · A page with no login form

- [ ] Open `https://en.wikipedia.org`
- [ ] Popup → pick any item → **Fill**
- [ ] Expect **"No login form on this page"**, and the copy actions still available

### C3 · A page the extension must not touch

- [ ] Open `chrome://extensions`, then any PDF (drag one into a tab)
- [ ] No passio button appears, nothing errors, and the popup still opens and works
- [ ] Fill from the popup says it cannot fill this kind of page

### C4 · Two browser windows share one unlock

- [ ] Unlock in one window, press **Ctrl+N** for a second
- [ ] Open the popup there → already unlocked

One offscreen document serves the whole browser, so this is expected. Two *profiles*
are separate and would each need unlocking.

### C5 · An item with nothing to copy

- [ ] Create a login with a username but **no password**
- [ ] Its `⋯` menu offers Copy username but **not** Copy password
- [ ] Create a secure note — it has no Fill button at all

Offering "Copy password" on an item with none puts an empty string on your clipboard and
looks like the app lost it.

### C6 · A long folder name

- [ ] Create a folder called `Work accounts and everything else I keep for the office`
- [ ] Open the popup's **Folder** filter → the name truncates, the dropdown does not
      stretch the popup or grow a sideways scrollbar

### C7 · Nothing matches

- [ ] Search for `zzzzqqq` → "Nothing matches" rather than an empty void
- [ ] Pick a folder and type filter that cannot both be true → "No items in this filter"

### C8 · A slow or interrupted save

- [ ] Start editing an item, turn off Wi-Fi, then press Save
- [ ] Expect a clear failure saying nothing was changed — never a success message

A password manager reporting a save that did not happen is the worst failure it has.

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

---

## What the redesign moved

Everything below still works the same way; only where you click changed.

| Was | Now |
|---|---|
| Tab bar across the bottom of the popup | Segmented control in the popup header |
| "New" button in the popup header | A `+` icon in the header, beside the pop-out arrow |
| Folder and type dropdowns | One row of filter pills, with folders behind a menu |
| Sidebar of counts (web) | The same filter rail as the popup |
| Category screen on a phone (web) | The same filter rail, wrapped |
| Grey square icon per row | A coloured disc carrying the item's initial |
| Teal key button in a form field | A dark circle carrying the passio dial |

Two things are worth a specific look, because neither could be verified without a
browser:

- **Fonts in the extension.** Every extension page previously rendered in the
  browser's default face; they should now match the web app exactly. If the popup
  still looks like Times or the system UI font, the self-hosted woff2 files are not
  loading — check the popup's devtools Network tab for `assets/*.woff2`.
- **The in-field button.** It now draws a literal "p" in a system monospace stack,
  because it lives in a closed shadow root inside someone else's page and inherits
  nothing. If the letter looks wrong or off-centre, say so and it goes back to an SVG.
