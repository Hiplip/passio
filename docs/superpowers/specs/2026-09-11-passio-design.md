# passio — design spec

**Date:** 2026-09-11
**Status:** approved (brainstorm complete, pre-implementation)

A zero-knowledge personal password manager with TOTP support. Single user at MVP,
structured so it can be narrowed to a small shared group later.

---

## 1. Decisions

Decisions marked **(user)** were chosen explicitly during brainstorming.
Decisions marked **(default)** were made by the agent and recorded in DECISIONS.md.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Zero-knowledge encryption** (user) | Server stores ciphertext only. A compromised database or deploy yields nothing readable. |
| 2 | **Responsive web app only** (user) | No browser extension, no native app, no PWA. One Next.js app, testable by the gates. |
| 3 | **One password, Bitwarden protocol** (user) | Master password derives both the auth hash and the encryption key. Never transmitted. |
| 4 | **Logins + secure notes + credit cards** (user) | No import, no folders, no tags, no sharing at MVP. |
| 5 | **Recovery key / emergency kit** (user) | Vault key wrapped a second time under a random 256-bit recovery key, shown once at signup. |
| 6 | **Registration closes after first account** (default) | Public Vercel URL. Open signup on a password manager is a liability. |
| 7 | **AES-GCM, not AES-CBC+HMAC** (default) | GCM is authenticated; Bitwarden's separate MAC key would be dead weight. |
| 8 | **KDF params are an app constant; salt is the normalized email** (default) | Removes the `/prelogin` endpoint entirely, and with it an unauthenticated user-enumeration oracle. Cost: email address is immutable at MVP. |
| 9 | **Soft delete on items** (default) | One column and a filter. Accidental deletion is otherwise unrecoverable. |

### Non-goals

Explicitly out of scope. Do not build these, even if they seem easy:

- Browser extension, autofill, native or mobile apps, PWA/offline
- Import from Bitwarden / 1Password / LastPass / CSV
- Folders, tags, favorites, sorting beyond alphabetical
- Sharing, organizations, multi-user vaults, invites beyond the single-owner gate
- Password-strength auditing, breach checking, any outbound third-party API call
- Transactional email — no verification emails, no password-reset emails, no email provider.
  Recovery is the recovery key, not an email link. **The MVP requires zero third-party API keys.**
- Attachments, file storage
- Email address change (blocked by decision 8 — see §3.3)

---

## 2. Architecture

Single Next.js App Router application deployed to Vercel.

```
Browser                          │ Server (Vercel + Neon)
─────────────────────────────────┼──────────────────────────────
master password                  │
  ↓ lib/crypto (Web Worker)      │
masterKey ──→ authHash ──────────┼──→ Better Auth (hashes it again)
  ↓ HKDF                         │
stretchedKey                     │
  ↓ unwraps                      │
vaultKey (memory only) ←─────────┼─── protectedVaultKey (ciphertext)
  ↓ encrypt/decrypt              │
item plaintext ←→ ciphertext ────┼──→ item.ciphertext (opaque blob)
```

tRPC is a ciphertext store. It authenticates the caller, enforces row ownership, and moves
opaque strings. **There is no server-side decrypt path anywhere in the codebase.**

### 2.1 Module boundaries

`src/lib/crypto/` is the trust-critical unit. It imports **only** `hash-wasm` and WebCrypto.
It must not import React, Next, tRPC, Drizzle, or anything that performs I/O. It performs no
network access, no storage access, and no logging.

Public surface — nothing else is exported:

```ts
deriveMasterKey(masterPassword: string, email: string): Promise<Uint8Array>
deriveAuthHash(masterKey: Uint8Array, masterPassword: string): Promise<string>
stretchMasterKey(masterKey: Uint8Array): Promise<CryptoKey>
generateVaultKey(): Promise<CryptoKey>
wrapVaultKey(vaultKey: CryptoKey, wrappingKey: CryptoKey): Promise<string>
unwrapVaultKey(wrapped: string, wrappingKey: CryptoKey): Promise<CryptoKey>  // throws on failure
encryptItem(plaintext: unknown, vaultKey: CryptoKey): Promise<string>
decryptItem(cipher: string, vaultKey: CryptoKey): Promise<unknown>           // throws on failure
generateRecoveryKey(): Promise<{ display: string; key: CryptoKey }>
deriveRecoveryWrappingKey(display: string): Promise<CryptoKey>
```

This module is why the whole design is defensible, and it is the part with no human reviewer.
It gets the most test coverage in the project (§7.1).

---

## 3. Cryptography

All parameters below are **normative**. Do not substitute values.

### 3.1 Constants

```ts
KDF_VERSION      = 1
ARGON2_MEMORY    = 65536        // KiB (64 MiB)
ARGON2_ITERATIONS= 3
ARGON2_PARALLEL  = 4
ARGON2_HASH_LEN  = 32           // bytes
HKDF_INFO_VAULT  = "passio-vault-key-v1"
HKDF_INFO_RECOV  = "passio-recovery-key-v1"   -- domain separation from the vault path
HKDF_INFO_RECOV_AUTH = "passio-recovery-auth-v1"  -- the server-facing verifier
AES_IV_BYTES     = 12           // 96-bit, fresh per encryption
AES_TAG_BITS     = 128
CIPHER_VERSION   = "v1"
```

### 3.2 Derivation chain

```
normalizedEmail = email.trim().toLowerCase()

argonSalt    = SHA-256( utf8("passio-salt-v1:" + normalizedEmail) )   -- 32 bytes

masterKey    = Argon2id(
                 password = masterPassword,
                 salt     = argonSalt,
                 memory   = 65536, iterations = 3, parallelism = 4, hashLength = 32)

authHash     = base64url( PBKDF2-SHA256(
                 password   = masterKey,
                 salt       = utf8(masterPassword),
                 iterations = 1,
                 length     = 32) )

stretchedKey = HKDF-SHA256(ikm = masterKey, salt = <empty>, info = HKDF_INFO_VAULT, length = 32)
               → imported as an AES-GCM CryptoKey

vaultKey     = crypto.getRandomValues(32 bytes)   // generated once, at signup only
```

`authHash` is what Better Auth receives in its `password` field. Better Auth hashes it again
with its own algorithm before storage, so the database holds a hash of a hash. The raw master
password and `masterKey` never leave the Web Worker.

**Why the email is hashed rather than used directly.** Argon2 requires a salt of at least 8 bytes,
and a short address such as `a@b.co` is only 6 — it would fail outright. Hashing to a fixed 32 bytes
also domain-separates the salt, so the value is derived from the email without ever being the email.
The security property is unchanged: the salt is still a deterministic function of the address alone.

### 3.3 Why the email is the salt

Bitwarden requires an unauthenticated `/prelogin` endpoint so the client can fetch a user's KDF
parameters and salt before deriving. That endpoint is a user-enumeration oracle and needs
careful mitigation.

Fixing the KDF parameters as an application constant and using the normalized email as the salt
removes the endpoint and the entire pre-authentication attack surface.

**Accepted cost:** the email address is part of the derivation, so **changing it invalidates the
master key**. Email change is therefore not supported at MVP and must be explicitly blocked in the
UI and API. If it is ever needed, it becomes a dedicated flow: re-derive, re-wrap the vault key,
re-register the auth hash — the same mechanics as changing the master password (Phase 6).

`KDF_VERSION` and `CIPHER_VERSION` exist so parameters can be migrated later without a breaking
rewrite. Ciphertexts are self-describing.

### 3.4 Cipher string format

```
v1.<base64url(iv)>.<base64url(ciphertext || tag)>
```

AES-256-GCM. A fresh 96-bit IV per encryption, never reused. Parsing rejects any string whose
version prefix is unrecognised rather than guessing.

### 3.5 Key wrapping

`vaultKey` is generated once and never changes for the lifetime of the account. It is stored
only as ciphertext, wrapped twice:

- `protectedVaultKey` = `wrapVaultKey(vaultKey, stretchedKey)` — the normal unlock path
- `recoveryWrappedVaultKey` = `wrapVaultKey(vaultKey, deriveRecoveryWrappingKey(recoveryKey))` — the emergency path

Because items are encrypted with `vaultKey` and not with anything derived from the master
password, **changing the master password re-wraps 32 bytes and re-registers an auth hash. It does
not re-encrypt the vault.**

### 3.6 Recovery key

240 bits (30 bytes) from `crypto.getRandomValues`, rendered as Crockford base32 in hyphenated
groups for transcription, prefixed with a version marker. 30 bytes encodes to exactly 48 base32
characters, giving 8 even groups of 6 — a 32-byte key would leave a ragged final group:

```
PASSIO-1-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX
```

Its wrapping key is `HKDF-SHA256(ikm = decoded recovery key, info = HKDF_INFO_RECOV)`. The info
string differs from the vault path deliberately, for domain separation. It is displayed
**exactly once**, at signup, on a printable page. It is never stored in plaintext, never logged,
and never recoverable afterwards.

**The recovery verifier.** The recovery key cannot authenticate to the server on its own — the
server holds only ciphertext and cannot tell a correct recovery key from a wrong one, so it cannot
authorise the password change that recovery requires. A third derivation,
`deriveRecoveryAuthHash(recoveryKey)` under `HKDF_INFO_RECOV_AUTH`, is sent at signup and stored as
`user.recoveryVerifier`, hashed again server-side with Better Auth's password hasher. Presenting it
proves possession without revealing the key.

This is created **at signup**, because the recovery key is displayed exactly once and can never be
reconstructed. An account created without it would be permanently unrecoverable.

**Threat note:** the recovery key plus database access is equivalent to owning the vault. This is
the same bargain 1Password's Emergency Kit makes, and it is accepted deliberately.

### 3.7 Unlock

Unlock is entirely client-side and requires **no server round-trip**:

1. Derive `masterKey`, then `stretchedKey`.
2. Attempt `unwrapVaultKey(protectedVaultKey, stretchedKey)`.
3. GCM tag failure ⇒ wrong master password. Success ⇒ `vaultKey` held in memory.

There is no server-side oracle for master-password correctness. Attempts are throttled
client-side (exponential backoff after 5 failures) to avoid burning CPU on typos, not as a
security control.

### 3.8 What the server never sees

The master password, `masterKey`, `stretchedKey`, `vaultKey`, the recovery key, and every item
field. Its total visible metadata is: which emails have accounts, how many items each has, and
row timestamps.

---

## 4. Data model

Drizzle + Neon Postgres.

```
user                     -- Better Auth managed, extended with additionalFields
  id, email (unique, immutable), name, emailVerified, createdAt, updatedAt
  protectedVaultKey        text  not null
  recoveryWrappedVaultKey  text  not null
  recoveryVerifier         text  not null   -- hashed server-side
  kdfVersion               integer not null default 1

account                  -- Better Auth managed. The credential row holds a hash
                            of authHash. The raw master password never arrives.

session, verification    -- Better Auth managed, unmodified

item
  id          uuid  PK
  userId      text  not null, FK → user.id, cascade delete, INDEXED
  ciphertext  text  not null
  createdAt   timestamptz not null
  updatedAt   timestamptz not null
  deletedAt   timestamptz nullable        -- soft delete

invite                   -- table created, UNUSED at MVP (see note below)
  id, email, token, createdAt, expiresAt, acceptedAt
```

**On the `user` table:** the vault key material lives here as Better Auth `additionalFields` with
`required: true`, rather than in a separate table. Better Auth mounts a public
`/api/auth/sign-up/email` route, so a separate table written by application code could be bypassed,
producing a user row with no key material — a permanently un-unlockable account. Putting the columns
on `user` makes that state unrepresentable.

**On `invite`:** the table is created in Phase 1 as schema groundwork for the future
multi-user direction, but **nothing at MVP reads or writes it**. There is no invite UI and no
invite redemption. `account.register` simply returns 403 once any account exists. Do not build
an invite flow; it is a non-goal.

`item` has no type column, no title, no URL, no tags. **Item type and every field live inside the
encrypted blob.** The client decrypts the whole vault on unlock and searches in memory, so
server-side filtering was never needed and the metadata leak is minimised for free.

### 4.1 Item plaintext schemas

The decrypted blob is JSON, discriminated on `type`, validated with Zod **after** decryption:

```ts
{ type: "login",  title, username, password, uri, notes, totpSecret? }
{ type: "note",   title, body }
{ type: "card",   title, cardholderName, number, brand?, expMonth, expYear, cvv, notes }
```

`totpSecret` stores the base32 secret. If the user pastes an `otpauth://` URI, the client parses
it and stores the extracted secret plus any non-default `digits`/`period`/`algorithm`.

---

## 5. API surface

tRPC routers. Every procedure except `account.register` and `account.status` is protected and
scoped to `ctx.session.user.id`.

```
account.status     query     → { registrationOpen: boolean }
                             Decides what the signup page renders. The authoritative
                             gate is a databaseHooks.user.create.before hook that counts
                             users and aborts — it holds for every entry point, including
                             Better Auth's own public sign-up route.
                             Registration is an unconditional close once any account
                             exists; see the invite note in §4.

Signup itself goes through Better Auth's signUp.email carrying protectedVaultKey,
recoveryWrappedVaultKey and recoveryVerifier as additional fields. There is no
separate register mutation — it would be a second, weaker path to the same place.

recovery.getWrappedKey query → { recoveryWrappedVaultKey }   (public; returns a decoy
                             for an unknown email so it is not an enumeration oracle)
recovery.recover   mutation  ← { email, recoveryAuthHash, newAuthHash,
                                 newProtectedVaultKey, newRecoveryWrappedVaultKey,
                                 newRecoveryVerifier }
                             Verifies the recovery verifier, rotates credentials and
                             both wrapped copies, revokes all sessions. Locks out for
                             15 minutes after 5 failures.
vault.getKeys      query     → { protectedVaultKey, kdfVersion }
vault.rewrap       mutation  ← { authHash, protectedVaultKey }   (Phase 6, master password change)

item.list          query     → { id, ciphertext, createdAt, updatedAt }[]  (deletedAt IS NULL)
item.create        mutation  ← { ciphertext }
item.update        mutation  ← { id, ciphertext }
item.delete        mutation  ← { id }            (sets deletedAt)
item.restore       mutation  ← { id }
```

**Ownership is enforced in the WHERE clause of every query, never in application code after the
fetch.** A row belonging to another user must be indistinguishable from a row that does not exist.

---

## 6. Phases

Six vertical slices. Each deploys live and leaves the app shippable. No phase depends on a later
one. Routes listed are the smoke-check surface for that phase, cumulative with all prior phases.

### Phase 1 — Account exists, vault unlocks

Provisioning (Neon project, GitHub repo, Vercel link, env sync per global CLAUDE.md), T3 scaffold,
Vitest tooling, the complete `lib/crypto` module with its full test suite, Web Worker for
derivation, Better Auth configured to receive `authHash`, `account.register` gated to the first
account, login, unlock screen, empty vault shell. Recovery key generated, wrapped, and displayed
once on a printable page at signup. Design system established here — palette and type scale set
via the frontend-design skill and reused throughout.

**Proves it works:** create the owner account, see the recovery key, log out, log in, unlock, land
on an empty vault. A second signup attempt returns 403.
**Routes:** `/`, `/signup`, `/login`, `/vault`

### Phase 2 — It holds passwords

Login-item CRUD, encrypted client-side. List, detail, create, edit, soft-delete, restore.
Copy-to-clipboard with 30-second auto-clear.

**Proves it works:** create a login item, reload, see it decrypt; edit it; delete and restore it.
**Routes:** `+ /vault/new`, `/vault/[id]`

### Phase 3 — TOTP

Accept an `otpauth://` URI or a raw base32 secret on a login item. Live 6-digit code with a
countdown ring, regenerating on the period boundary. Click to copy.

**Proves it works:** add a known RFC 6238 test secret, confirm the rendered code matches the
vector for a fixed clock.
**Routes:** as Phase 2

### Phase 4 — Daily-driver quality

Password generator (length, character classes, passphrase mode), in-memory search across the
decrypted vault, idle auto-lock with configurable timeout, manual lock button.

**Proves it works:** generate a password into a new item; search finds it; idle past the timeout
re-locks; unlock restores without re-login.
**Routes:** `+ /settings`

### Phase 5 — Notes and cards

Type discriminator handling, two additional render forms, card-number masking with reveal.

**Proves it works:** create one of each type, reload, all three decrypt and render correctly.
**Routes:** as Phase 2

### Phase 6 — Recovery

Redeem the recovery key to regain access without the master password (sets a new master password
and re-wraps). Printable emergency-kit page. Change master password.

**Proves it works:** with the recovery key from Phase 1, set a new master password and confirm
every existing item still decrypts — verifying the vault key survived unchanged.
**Routes:** `+ /recover`, `/settings/security`

---

## 7. Failure modes and error handling

**Argon2id blocks the main thread** for roughly a second at these parameters, long enough to
visibly freeze a spinner mid-animation. All derivation runs in a **Web Worker**. This is the
non-obvious complexity in Phase 1.

**Wrong master password** is a GCM tag failure, detected client-side (§3.7). The error message
must not distinguish "no such account" from "wrong password".

**A corrupt item must not take down the vault.** Decryption is per-item; a failure renders that
row as damaged and leaves every other item usable. Never discard a ciphertext that failed to
decrypt — it may be recoverable.

**Saves are explicit, never optimistic.** Optimistic UI could display a password that was never
persisted. Write, await confirmation, then update the view.

**Session expiry while unlocked** drops `vaultKey` from memory and returns to login. No silent
half-state where the UI appears unlocked without a key.

**The vault key never touches persistent storage** — not localStorage, not sessionStorage, not
IndexedDB, not a cookie. Memory only, for the lifetime of the tab or until lock.

---

## 8. Testing

Vitest only. No Playwright, no Cypress, no browser — none is installed and none will be.

### 8.1 `lib/crypto` — the serious coverage

- **RFC 6238 published test vectors** for TOTP against fixed timestamps
- **Round-trip**: encrypt → decrypt returns the original for every item schema
- **Tamper**: flipping a single ciphertext byte causes decrypt to **throw**, never to return garbage
- **Wrong key**: unwrapping with a key derived from a different password throws
- **IV uniqueness**: repeated encryption of identical plaintext yields distinct ciphertexts
- **Determinism**: the same password and email always produce the same `masterKey` and `authHash`
- **Version rejection**: an unknown cipher-version prefix is rejected, not guessed at
- **Recovery**: a vault key wrapped under both paths unwraps identically from either

### 8.2 tRPC integration

Against the real Neon dev database. Each test creates the rows it needs and cleans up after
itself. Mandatory assertion: **user A cannot read, update, or delete user B's item** — tested
directly, for every item procedure, not assumed from the WHERE clause.

Also: `account.register` returns 403 on the second account; `item.list` excludes soft-deleted rows.

### 8.3 Component

Testing Library for the signup, login, unlock, and item forms.

### 8.4 Smoke

`bash scripts/smoke.sh` boots the production build and confirms every route for the completed
phases returns 200, then stops the server. This proves the app boots and routes are alive. It
renders nothing.

---

## 9. Open items

None blocking. Deliberately deferred, with the phase that would own them:

- Email address change — blocked by §3.3, would be its own phase
- Import from other managers — the thing that would make switching realistic; its own phase
- Encrypted vault export as a second backup — complements the recovery key
- Folders, tags, favourites
- Multi-user / shared vaults — the "niche it down to ours" direction; the `invite` table is the groundwork
