# passio extension — what to do on your machine

Everything below needs a real browser. There is none on the VPS, so none of it could be
verified by the agent that built it. Work through it in order; each step gates the next.

**Build output to load:** `apps/extension/.output/chrome-mv3/`
**Expected extension id:** `olifgfoaipigflfaiadpjalokaoonjjo`

---

## 0. Back up the signing key — do this first

`apps/extension/key.pem` exists only on the VPS and is deliberately gitignored. It is the
private half of the extension's identity.

```bash
cat apps/extension/key.pem       # copy into your password manager, then close the terminal
```

**Why it matters:** the extension id is derived from this key. Lose it and the id
changes, which breaks the CORS allowlist and Better Auth `trustedOrigins` — both of
which hard-code the current id in `apps/web/src/server/cors.ts`. Recovering means regenerating
the key, updating that file, and redeploying.

The public half is committed in `apps/extension/.identity` and in the manifest. That one is
fine to share.

---

## 1. First — confirm the web app still works

The whole repo was restructured into `apps/` + `packages/`. Every gate passed and
production is serving correctly, but this is where your **actual vault** lives, so it is
worth two minutes before touching the extension.

At https://passio-hiplip.vercel.app:

- [ ] Log in and unlock — all your items are there
- [ ] Open an item, reveal a password, copy it
- [ ] A TOTP code appears and counts down
- [ ] Create a throwaway item, then delete it (it lands in Trash)
- [ ] Folders and the category filters still work

If anything here is wrong, **stop and tell me**. That is a regression in your real vault
and it outranks everything else on this page.

---

## 2. Load the extension

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select `apps/extension/.output/chrome-mv3/`

**Check the id matches `olifgfoaipigflfaiadpjalokaoonjjo` exactly.** If it does not, the
pinned key did not take effect and every API call will fail CORS. Stop here and say so.

Expect Chrome to list exactly these permissions: read your browsing history (that is
`tabs`, used for the badge), and access to `passio-hiplip.vercel.app`. **If Chrome says
"Read and change all your data on all websites", something is wrong** — that is the
`<all_urls>` posture this design deliberately rejected.

---

## 3. Sign in

Click the toolbar icon. Enter your email and master password.

**The server half of this is already verified.** A CORS preflight from
`chrome-extension://olifgfoaipigflfaiadpjalokaoonjjo` returns the correct
`allow-origin`, `allow-headers: authorization` and `expose-headers: set-auth-token`
against production, and an unknown origin gets nothing back. That turned out to be
testable with curl — a preflight is just an HTTP request. What is left is the client
half.

- The button should read **"Unlocking…"** for about a second. That is Argon2id at 64 MiB.
- If it fails with something about WebAssembly, the CSP is wrong.
- If it fails instantly with a network error, the bearer token is not being stored or
  replayed — the server is known good.

Expected: the vault list appears.

---

## 4. The important one — does the key survive worker eviction?

**This is the single assumption the whole design rests on, and it is the one thing that
could not be tested.** MV3 kills the service worker after ~30 seconds idle. The vault key
lives in an offscreen document precisely because that should outlive it.

1. Unlock the vault, then close the popup.
2. Go to `chrome://extensions` and watch the passio card. Within a minute the
   **"service worker"** link changes to **"service worker (Inactive)"**.
3. Once it says Inactive, click the toolbar icon again.

**Pass:** the vault list appears, still unlocked.
**Fail:** you are asked for your master password again.

A failure here is not a bug to patch around — it means offscreen documents do not
persist the way Chrome's docs describe, and the key-custody decision (spec D1) needs
revisiting. Tell me and I will rework it rather than paper over it.

---

## 5. Autofill

1. Go to a real login page you have saved (GitHub is a good first test).
2. The toolbar icon should show a **badge with the number of matching logins**.
3. Click the icon. The matching item appears under **"For this site"**.
4. Click **Fill**.

Expected: username and password land in the form, the popup closes, and **nothing is
submitted**. You click sign in yourself — that is deliberate.

Worth testing specifically:

- **A React-heavy site.** The fill goes through the prototype's native value setter to
  get past React's change tracker. If a field visibly fills and then blanks itself, that
  bypass is not working on that site.
- **A site with a separate 2FA page.** The one-time code is only filled if the field is
  on the page at the time; otherwise use **Code** to copy it.
- **A change-password form.** It should refuse to fill and say "No login form on this
  page". That is correct: two password fields means guessing, and guessing wrong there
  is expensive.
- **A page in an iframe** (some banks). Will not fill — `allFrames` is off by design.
  Copy still works.

---

## 6. Auto-lock

- Set **Lock after** to 1 min in the popup footer, leave it alone, come back. It should
  ask for the master password (not the email — that is remembered).
- Lock your laptop screen and unlock it. The vault should be locked.

---

## 7. Optional — stop the developer-mode nag

Load-unpacked works forever but Chrome nags on every start. If that annoys you, publish
it to the Chrome Web Store as **Unlisted**: you get auto-updates and no nag, only people
with the link can install, and a $5 one-time developer fee applies. Password managers do
draw extra review scrutiny — the narrow permission set should help.

---

## 8. The full vault page

New: the popup's **Full vault** button (bottom left) opens the whole vault in a browser
tab — the same interface as the web app, running inside the extension, already unlocked.

- [ ] Click **Full vault**. The item list appears with the sidebar, folders and search.
- [ ] Create an item. It should appear in the list and in the web app.
- [ ] Edit an item, save, confirm the change sticks after a reload.
- [ ] Create a folder, move an item into it, delete the folder — its items become
      unfiled rather than disappearing.
- [ ] Delete an item, find it in Trash, restore it.
- [ ] From the popup, open an item's **⋯ → Edit in full vault** — it should deep-link
      straight to that item.

The vault key never enters this page: it sends plaintext to the offscreen document,
which encrypts. That the page holds plaintext at all is a deliberate widening over the
popup, recorded in `DECISIONS.md`.

---

## What is deliberately not built

Not oversights; each was decided in the spec:

- **Signup, recovery-key redemption, changing the master password.** Creating and
  editing items and folders now works in the extension; these three still live in the
  web app, because they touch credentials themselves rather than vault contents.
- **No offline access.** Nothing but the session token and your lock preference touches
  disk — no plaintext, no ciphertext.
- **No "save this password?" prompt** on new logins. That needs to observe form
  submissions, which `activeTab` does not allow.
- **Chrome only.** Firefox has no offscreen API; it would need a second key-custody
  implementation, on the most security-critical component, untestable here.

If you want any of these, they are additive — say which and I will spec it.
