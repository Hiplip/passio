# Parity run — handoff

**Run:** 2026-09-15, unattended
**Commits:** `2ec1a48` … `2135269` (six, all pushed, all deployed)
**Tests:** 636 → 814 (+178)
**Gates:** typecheck, lint, build, test, smoke — green on every commit

---

## 1. What to check on your end

Nothing here is verifiable on the build machine, because there is no browser on
it. In rough order of "most likely to be wrong".

### The extension — reload it first

```powershell
cd D:\Downloads
scp you@your-dev-box:/tmp/passio-extension.tar.gz .
tar xzf passio-extension.tar.gz
```

- [ ] **Existing items still open.** The item schema changed. Nothing should
      need migrating — the old `uri` field is still read — but this is the one
      that matters most. Open three or four items you already had.
- [ ] **The popup still fills a login.** The fill payload changed shape.
- [ ] **Card autofill.** Add a card, go to a checkout page, click Fill. Number,
      expiry and security code should land. **This is the single most likely
      thing to be wrong** — real checkout forms are hostile and the detection
      heuristics have only ever seen synthetic fixtures.
- [ ] **Identity autofill** on a signup or shipping form.
- [ ] **The in-field button still appears** and still fills.

### The web app

- [ ] **Import.** Settings → Import and export. Export from Bitwarden
      *unencrypted* and import it. Check a few items, and read the warnings —
      they are meant to tell you exactly what did not come across.
- [ ] **Export, then re-import it.** Round-trips through our own CSV reader.
- [ ] **The new item types.** Create an identity, a passport, a crypto wallet.
      Confirm the seed phrase field is masked.
- [ ] **Custom fields** on an item, including a hidden one.
- [ ] **Vault health.** Settings → Vault health. The numbers should match your
      intuition about your own vault.
- [ ] **Breach check.** Toggle it on and run it. It should either report
      findings or say it could not reach the service — never silently claim
      everything is fine.
- [ ] **Favourites and sorting** on the vault list.
- [ ] **Generator → Username tab**, all three styles.

### Worth a deliberate look

- **Match modes.** Add a second web address to a login with a non-default mode
  (host, exact, regex) and confirm the popup offers it on the right page and
  not on the wrong one. The unit tests are thorough but they are not a browser.
- **`never`** on an address should silence that address and nothing else.

---

## 2. What was built

### Schema and data model (`2ec1a48`)

- **Custom fields** on every item type — text, hidden, boolean. Inside the
  encrypted blob, so the server cannot see how many fields an item has or what
  they are called.
- **Fifteen new item types**: identity, bank account, email account, passport,
  driving licence, crypto wallet, SSH key, API credential, server, database,
  software licence, Wi-Fi router, membership, reward program, medical record.
- **URI match modes** — a login carries a *list* of addresses, each with a mode
  (domain, host, startsWith, exact, regex, never). Every mode fails **closed**:
  an invalid regex matches nothing rather than everything.
- **Password history**, capped at ten, deduped.
- All eighteen types are driven by **one table** (`@passio/core/fields`) feeding
  the editors, copy menus, type picker, filters and headings.

### Import and export (`a41b1ca`)

- Import from **Bitwarden JSON, LastPass, Chrome/Edge/Brave, Firefox, KeePass,
  1Password CSV, and our own CSV**.
- Export as **JSON** (lossless) and **CSV**, with the losses named *before* the
  file is written.
- A CSV reader that survives commas in passwords, embedded newlines, doubled
  quotes, CRLF and Excel's byte-order mark.

### Health and breach (`bd5b57b`)

- **Password strength** scored locally — no dictionary download, no network.
- **Vault health**: weak, reused, unchanged for a year, sent over http.
- **Breach checking** against Have I Been Pwned using k-anonymity. Off by
  default. Unreachable degrades to *unknown*, never to *safe*.

### Autofill (`bec1ef3`)

- **Card and identity autofill**, `autocomplete` attributes first and heuristics
  second.
- **Excluded domains** — a per-site opt-out.

### Vault management (`f45fa31`)

- **Favourites**, pinned above everything whatever the sort order.
- **Sorting** by name, recently updated, oldest first.
- **Username generator** — words, random letters, plus addressing.
- **Generator history**, session only, never written to disk.

### Accounts (`2135269`)

- **Multi-user registration**, gated by `REGISTRATION_OPEN`, **default closed**.

---

## 3. Left for you

### One decision, one env var

**Registration is still closed.** Multi-user works; turning it on is a
security-posture change I was not willing to make to a live deployment on your
behalf. When you want it:

```bash
vercel env add REGISTRATION_OPEN production --scope hiplip   # value: true
```

Anything other than the literal string `true` leaves it shut.

### The next thing to build, and why it is first

**The per-user keypair.** Every sharing feature — family vaults, Send, emergency
access, sharing one item with one person — needs somewhere to wrap a key *to*.

It is cheapest now, while there is **one vault** to re-encrypt rather than a
hundred. I did not do it tonight because it is X25519 generation, wrapping a
private key under the vault key, and a migration path for your existing account
— trust-critical work that should not be rushed at the end of an unattended run.
It is specified in `docs/superpowers/specs/2026-09-15-parity-design.md`.

### Not built, deliberately

| | Why |
|---|---|
| iOS, Android, desktop | Off the table per your instruction. Also: no toolchain here, and neither React Native nor Expo has WebCrypto, so `@passio/crypto` cannot be reused |
| **Firefox** | Tried, then stopped. `wxt build -b firefox` produces an artifact that **cannot work**: offscreen documents are a Chromium API, so `chrome.offscreen.createDocument` is undefined there and the first unlock throws. Groundwork is in `wxt.config.ts`; making it real means moving custody into the background script |
| Attachments | Needs a blob store that does not exist |
| Email — verification, alerts, share invites | No provider configured, no API key on this machine |
| Account 2FA, emergency access, Send, family plans | All need either email or the keypair first |
| Email alias services (SimpleLogin, Firefox Relay…) | Every one needs a third-party API key |
| Passkeys | Cryptographic protocol work where mistakes are silent. Wants a browser to develop against |
| SSO, SCIM, enterprise policy, localisation | Explicitly abandoned — see the spec |

### Two things I'd verify before trusting

1. **Card autofill on a real checkout.** The detection was built against
   synthetic fixtures. Real payment forms use iframes, custom elements and
   deliberately obfuscated field names. Expect to iterate.
2. **Import against a large real export.** The parsers are tested against
   fixtures shaped like real files, not against a two-hundred-item export from
   an account with years of history in it.

---

## 4. Things the run found

Worth recording, because each was a silent failure rather than an error.

- **Our CSV export could not be read by any of our own importers.** Export uses
  Bitwarden's column names; nothing read them. Exporting to CSV and importing it
  back produced an empty vault, silently. Found by a round-trip test; fixed with
  `parsePassioCsv`.
- **`\b` does not mean what field names need.** It counts `_` and digits as word
  characters, so `\bcity\b` never matched `billing_city` and `\bcvv\b` never
  matched `cvv2` — and real field names are made almost entirely of those. The
  heuristics now bound on letters.
- **The username generator was coupled to a passphrase's strength floor.**
  Routing it through `generatePassphrase` inherited a three-word minimum that
  exists for secrets. A username is not a secret.
- **Two old tests had quietly become wrong.** Both used `passport` and
  `identity` as stand-ins for "a type that does not exist". Both stopped being
  unknown the moment those types were added.
