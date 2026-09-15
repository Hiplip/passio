# passio feature parity — design spec

**Date:** 2026-09-15
**Status:** approved in advance by the owner for autonomous execution
**Extends:** `2026-09-11-passio-design.md` (crypto protocol) and
`2026-09-12-passio-extension-design.md` (extension architecture), both of which
remain authoritative on anything this document does not change.

Goal: close the gap between passio and Bitwarden / 1Password on **functionality**.
Pricing, packaging and tiering are explicitly out of scope — every feature here
is built as if available to everyone.

---

## 0. The governing idea

The gap list runs to roughly sixty items. It is not sixty decisions. Most of it
collapses into a handful of structural changes, and the ordering below is by
**how expensive each item becomes if deferred**, not by how valuable it is.

The reason is specific to this project: passio has exactly one user today, so
every schema and crypto change is free right now. It stops being free the moment
there are others, because in a zero-knowledge system the server cannot migrate
data it cannot read — the client has to, which means version skew and a long
tail of people on old builds holding blobs nobody can upgrade.

So: **anything that changes the shape of an encrypted blob or the key hierarchy
happens first.**

### The collapsing moves

| Structural change | Gap-list rows it closes |
|---|---|
| Extensible item schema + custom fields | ~13 (every missing item type, plus lossless import) |
| Per-item URI list with match modes | ~5 (match modes, equivalent domains, exclusions, card fill, identity fill) |
| Item history inside the blob | ~2 |
| Vault analysis over decrypted items | ~4 (weak, reused, old, unsecured) |
| One import/export module | ~7 (six source formats plus export) |
| Second build target in WXT | ~3 (Firefox, Edge, Opera) |

---

## 1. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Custom fields live inside the encrypted blob** | No database migration, and the server still cannot see how many fields an item has or what they are called. A column would leak structure. |
| 2 | **Item history lives inside the blob too** | Same reason. A separate `item_history` table would tell the server exactly when each password changed, which is a usage pattern worth hiding. |
| 3 | **New item types are added to the discriminated union, not modelled as custom fields on a generic item** | A passport has known fields that deserve labels, validation and a sensible editor. Generic key/value would make every specialised type a worse experience than a secure note. |
| 4 | **A login carries a list of URIs, each with a match mode** | One `uri` string cannot express "this login works on both `example.com` and `example.co.uk`", which is the single commonest autofill complaint in every competitor's issue tracker. |
| 5 | **Breach checking uses HIBP's k-anonymity range API, and is opt-in** | Sending the first five hex characters of a SHA-1 prefix reveals nothing usable. It is nonetheless the first outbound third-party call in the product's history, so it is off by default and stated plainly in the UI. Supersedes the original spec's "no outbound third-party API call" non-goal. |
| 6 | **Vault health analysis is entirely client-side** | Reuse and weakness are computed over the already-decrypted vault. No server involvement is possible anyway, and none is wanted. |
| 7 | **Import parses to the internal `Item` shape and never touches the network** | Import is a pure function over a string. That makes it exhaustively testable without a browser, which matters because there is no browser on the build machine. |
| 8 | **Export offers encrypted and plaintext forms, and the plaintext form warns** | Refusing to export would hold users' data hostage. The encrypted form uses the same Argon2id + AES-GCM primitives as the vault, under a password the user chooses at export time. |
| 9 | **Firefox is a second WXT build target, not a fork** | `firefox-mv3` from the same source. The manifest differs; the code does not. |
| 10 | **Reprompt is enforced in the custody layer, not the UI** | A flag the popup checks is a suggestion. Requiring the offscreen document to have seen a recent successful reprompt before it will release a field value is a control. |

### Non-goals — deliberately not built

Recording these so nobody wonders whether they were forgotten:

- **iOS and Android apps.** No toolchain, no device, no Mac, and neither React
  Native nor Expo exposes WebCrypto, so `@passio/crypto` cannot be reused. This
  is the largest remaining gap and it needs its own project.
- **Safari extension.** Requires Xcode to package.
- **Desktop apps.** Separate project; see the earlier desktop discussion.
- **Biometric unlock.** Needs real hardware to develop against, and shipping
  untested authentication is worse than not shipping it.
- **Attachments / file storage.** Needs a blob store that does not exist yet.
- **Transactional email.** No provider is configured and no API key exists on
  the build machine. Everything that depends on email — verification, breach
  alerts, share invites, emergency-access countdown notices — is specified but
  gated behind it.
- **Account 2FA, emergency access, Send, family plans, organisations.** All
  depend on either email or the per-user keypair landing first. The keypair is
  built here; the features on top of it are not.
- **SSO, SCIM, Directory Connector, enterprise policy.** Enterprise features
  that exist because those companies sell to enterprises. Explicitly abandoned.
- **Localisation beyond English.**
- **Third-party security audit.** Money, not code.

---

## 2. Data model

### 2.1 Custom fields

Every item type gains an optional `fields` array:

```ts
customFieldSchema = {
  name: string,
  value: string,
  kind: "text" | "hidden" | "boolean",
}
```

`hidden` renders masked and reveals on demand, exactly as a password does.
`boolean` stores `"true"` / `"false"` as a string so the blob stays a flat,
forward-compatible shape.

This is also what makes import lossless: Bitwarden and 1Password both export
arbitrary custom fields, and without somewhere to put them an import silently
drops data — the worst possible failure for a password manager.

### 2.2 URIs and match modes

A login's single `uri` string becomes:

```ts
uriEntrySchema = {
  uri: string,
  match: "domain" | "host" | "startsWith" | "exact" | "regex" | "never",
}
```

`domain` is the current behaviour — registrable domain via the Public Suffix
List — and remains the default. `never` is how a user says "offer nothing here"
for a specific saved login.

The legacy `uri` field is retained and read as a single `domain`-matched entry,
so existing items keep working with no migration step.

### 2.3 Item history

```ts
historyEntrySchema = { password: string, changedAt: string /* ISO */ }
```

Appended on save whenever the password actually changes, newest first, capped
at ten entries. The cap matters: a blob that grows without limit eventually
fails to decrypt in a reasonable time on a phone.

### 2.4 New item types

`identity`, `bankAccount`, `passport`, `driversLicence`, `sshKey`,
`apiCredential`, `softwareLicence`, `server`, `database`, `wirelessRouter`,
`emailAccount`, `membership`, `rewardProgram`, `medicalRecord`, `cryptoWallet`.

Each is a member of the discriminated union with its own named fields, and each
inherits `commonFields` plus `fields` and `favourite`.

`cryptoWallet` holds a seed phrase and is treated as a secret throughout — it is
the single highest-value item a vault can hold.

### 2.5 Per-user keypair

A new pair of columns on `user`:

- `publicKey` — X25519 public key, base64url, readable by anyone
- `wrappedPrivateKey` — the private key sealed under the vault key

Nothing in this spec consumes it. It exists now because adding it later means
re-encrypting every user's vault, and because every sharing feature — family
vaults, Send, emergency access — needs somewhere to wrap a key *to*.

---

## 3. Feature specifications

### 3.1 Import

One module, `@passio/core/import`, exposing `parseImport(format, text)` →
`{ items, folders, warnings }`. Formats:

| Format | Shape |
|---|---|
| Bitwarden | JSON (`items[]`, `folders[]`) |
| 1Password | 1PUX-adjacent JSON, and their CSV |
| LastPass | CSV |
| Chrome / Edge / Brave | CSV (`name,url,username,password,note`) |
| Firefox | CSV |
| KeePass | CSV |
| Generic | CSV with column mapping |

Rules that apply to all of them:

- **Nothing is dropped silently.** A field with no home becomes a custom field.
  Anything genuinely unrepresentable produces a `warning` naming the item.
- Folders are created and referenced by generated UUID.
- Duplicate detection by (title, username, first URI) — reported, never
  auto-merged. Merging someone's passwords without asking is unacceptable.
- Import is a pure function. No network, no clock, no randomness except the ids
  it is handed.

### 3.2 Export

`@passio/core/export` produces:

- **Encrypted JSON** — the vault sealed under a fresh Argon2id-derived key from
  a password the user supplies at export time. Self-describing: it carries its
  own KDF parameters so a future version can still read it.
- **Plaintext JSON** — every secret in the clear, behind an explicit
  confirmation that says so in those words.
- **CSV** — for moving to another manager. Lossy by nature; the UI says which
  fields will not survive.

### 3.3 Vault health

`@passio/core/health`, pure, over decrypted items:

- **Weak** — scored by a zxcvbn-style heuristic implemented locally (length,
  character classes, repeats, sequences, common patterns). No dictionary
  download, no network.
- **Reused** — the same password on more than one item, grouped.
- **Old** — unchanged for more than a configurable number of days, using item
  history where available and `updatedAt` otherwise.
- **Unsecured** — a URI whose scheme is `http:`.
- **Missing one-time code** — a login on a site known to support TOTP is *not*
  included; that requires a database of sites we will not maintain and would be
  wrong more often than right.

### 3.4 Breach checking

`@passio/core/breach`, using HIBP's range API with k-anonymity: SHA-1 the
password, send the first five hex characters, match the remainder locally.

The fetcher is injected, so the whole thing is tested without a network. Off by
default; the settings copy states exactly what leaves the device.

### 3.5 Autofill

- **Card fill** — cardholder name, number, expiry month/year, CVV, detected by
  `autocomplete` attributes first and heuristics second.
- **Identity fill** — name, email, phone, address lines, city, postcode,
  country.
- **Match modes** — as §2.2, applied in `matchItemsToUrl`.
- **Excluded domains** — a user-level list; no button, no suggestions, no fill.
- **Save prompt** — the content script watches for a submitted credential that
  is not already in the vault and offers to save it.
- **Update prompt** — the same, when a known username's password has changed.

The fill payload grows from three strings to a typed record. It still carries
only the values needed for the fields present on the page, and never the item.

### 3.6 Vault management

Favourites (pinned above the list), sort order (name, recently used, recently
updated, oldest), bulk select for move-to-folder and delete, per-item reprompt,
generator history (last twenty, session-only, never persisted), and a username
generator (random words, random string, or plus-addressed from a base email).

---

## 4. Testing strategy

There is no browser on the build machine. Everything below is therefore built
so the trust-critical parts are testable in Node:

- **Import** is a pure function over a string — every format gets fixtures,
  including malformed ones. This is the largest new test surface and the one
  most likely to lose user data if wrong.
- **Export → import round-trips** to the identical vault. Any field that does
  not survive is a bug or a declared CSV limitation.
- **Health analysis** is pure and gets adversarial fixtures.
- **Breach checking** runs against a stubbed fetcher, including the case where
  HIBP is unreachable — which must degrade to "unknown", never to "safe".
- **Match modes** get a table-driven test per mode, including the
  cross-tenant `*.github.io` case that already exists.
- **Field detection** extends `fields.test.ts` with card and identity fixtures.
- **Schema** round-trips every new item type through encrypt/decrypt.

What cannot be proven here, and goes on the handoff list instead: anything that
requires a rendering engine — the save prompt firing on a real form, card fill
landing in real checkout fields, the Firefox build actually loading.

---

## 5. Sequencing

1. Schema foundations — custom fields, history, URIs, new types, favourites
2. Import and export
3. Matching and autofill — modes, exclusions, card and identity fill
4. Health and breach
5. Vault management — favourites, sorting, bulk, reprompt, generators
6. Multi-tenancy and the per-user keypair
7. Firefox build target
8. Save and update prompts

Each phase leaves the app shippable, passes all five gates, and is pushed on its
own.
