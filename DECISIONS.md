# Decisions

Running log. Entries prefixed `NEEDS-REVIEW:` could plausibly have gone the other way.

## 2026-09-11 — Design (brainstorming)

Full rationale in `docs/superpowers/specs/2026-09-11-passio-design.md`.

Chosen by the user, not open for revisiting without asking:

- Zero-knowledge client-side encryption; the server stores ciphertext only.
- Responsive web app only. No extension, no native app, no PWA.
- One password, Bitwarden protocol — master password derives both the auth hash and the vault key.
- Item types: logins, secure notes, credit cards. No import, no folders, no tags.
- Recovery key / emergency kit, shown once at signup.

Agent defaults:

- NEEDS-REVIEW: Registration closes after the first account. The app sits on a public Vercel
  URL and open signup on a password manager invites strangers' vaults into the database.
  Reversible in a few lines if the intent was ever an open instance.
- NEEDS-REVIEW: KDF parameters are an app-wide constant and the salt is derived from the normalized
  email — specifically `SHA-256("passio-salt-v1:" + normalizedEmail)`, not the raw address, because
  Argon2 requires >= 8 salt bytes and a short email like `a@b.co` is only 6.
  This deletes the `/prelogin` endpoint and its user-enumeration oracle. Cost: the email address
  becomes immutable, because it is part of the derivation. Email change is a non-goal at MVP.
- NEEDS-REVIEW: Soft delete (`item.deletedAt`) included in the MVP schema. One column and a
  filter; accidental deletion in a password manager is otherwise unrecoverable. Minor scope
  addition beyond what was discussed.
- AES-256-GCM rather than Bitwarden's AES-CBC + HMAC. GCM is authenticated, so the separate MAC
  key in Bitwarden's HKDF output would be dead weight. Straightforward simplification.
- Argon2id via `hash-wasm`, run in a Web Worker. `hash-wasm` runs in both browser and Node, so
  derivation is unit-testable under Vitest with no browser — which the gates require.
- No transactional email and no email provider anywhere in the MVP. Recovery is the recovery key.
  Consequence: **this project needs zero third-party API keys.**

## Provisioning

<filled in during Phase 1: Neon project ID, region, and the variable NAMES set on Vercel>

## 2026-09-11 — Implementation plan

Found while writing `docs/superpowers/plans/2026-09-11-passio.md`. The spec was updated to match,
so spec and plan do not contradict each other.

- NEEDS-REVIEW: `userVaultKey` folded into the `user` table as Better Auth `additionalFields`.
  The spec created the user and the key row in a tRPC transaction, but Better Auth mounts a public
  `/api/auth/sign-up/email` route that bypasses tRPC entirely — which would create a user with no
  vault key material, a permanently un-unlockable account. `required: true` additional fields make
  that state unrepresentable.
- NEEDS-REVIEW: the single-account gate moved from a tRPC check to
  `databaseHooks.user.create.before`. An application-layer check only guards the path it sits on.
- NEEDS-REVIEW: `account.register` removed. With the above, signup goes through Better Auth's
  `signUp.email` with additional fields; a separate mutation would be a second, weaker path.
- NEEDS-REVIEW: a **recovery verifier** added, and created in Phase 1 rather than Phase 6.
  The recovery key cannot authenticate to the server — the server holds only ciphertext and cannot
  tell a correct key from a wrong one, so it cannot authorise the password change recovery needs.
  Without it the recovery key would be decorative and Phase 6 impossible. It must be created at
  signup because the key is shown exactly once; adding it later would leave every existing account
  unrecoverable.
- Recovery key is 240 bits (30 bytes), not 256. 30 bytes encodes to exactly 48 Crockford base32
  characters — 8 even groups of 6 — where 32 bytes leaves a ragged final group. 240 bits is far
  beyond any brute-force concern.
- `recoveryKeyCreatedAt` dropped at MVP (`user.createdAt` serves), reintroduced in Phase 6 when
  recovery keys become regenerable.
- Better Auth's default scrypt password hashing is used as-is. `authHash` is just a high-entropy
  string to it, so the database holds a hash of a hash. Overriding `password.hash` would add
  hand-written crypto for no gain.
- Passphrase wordlist comes from `@scure/bip39` (2048 audited words, 11 bits each) rather than
  shipping a wordlist of our own or fetching one.
- Password generator uses rejection sampling. `getRandomValues() % alphabet.length` biases toward
  the start of the alphabet and would quietly weaken every generated password.

## 2026-09-11 — Run blockers

- **BLOCKED: Vercel.** `VERCEL_TOKEN` returns HTTP 403 from `api.vercel.com/v2/user` and there is
  no stored CLI session (`vercel whoami` → "Logged out"). Token is revoked or expired. Recovery
  requires `vercel login` (browser) or a newly issued token — both human-only, and the standing
  rules forbid re-authenticating. Vercel linking, env mirroring, and deploy verification are
  skipped for the whole run. All other work proceeds.
- Decision: **still create the GitHub repo and push each gated phase.** Pushing is safe while no
  Vercel project is connected — there is no deploy to break — and it protects the work from loss.
  The rule against pushing blocked work is about not publishing broken code; the code itself is
  fully gated, and only external infrastructure is blocked.

## 2026-09-11 — Provisioning (Task 1.1)

- Neon project ID: `tiny-rain-06343556`
- Neon region: `aws-us-east-2`
- GitHub repo: `Hiplip/passio` (private), `origin` set, branch `main`
- Variables set in local `.env` (NAMES only): `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`
- Variables set on Vercel: **none — BLOCKED**, see the run blockers section above. When the token
  is replaced, mirror exactly those three names to production and preview.

## 2026-09-11 — Crypto module (Tasks 1.3–1.9)

Three deviations from the plan's verbatim code, all forced by this repo's compiler and
lint settings. No behaviour changed; nothing was weakened (no `any`, no assertions to
silence errors, no disabled rules).

- `encoding.ts` uses `CROCKFORD.charAt(i)` instead of `CROCKFORD[i]`. Under
  `noUncheckedIndexedAccess` the index form is `string | undefined`, which
  `restrict-plus-operands` rejects in `out += …`. `charAt` is typed `string`.
- Byte-producing helpers (`utf8ToBytes`, `fromBase64Url`, `fromCrockfordBase32`,
  `decryptBytes`) now declare `Uint8Array<ArrayBuffer>`, and `encryptBytes` takes the
  same. TypeScript 5.8's `BufferSource` excludes `SharedArrayBuffer`-backed views, so the
  bare `Uint8Array` the plan used is not assignable to WebCrypto parameters.
  `stretchMasterKey` copies its input (`new Uint8Array(masterKey)`) because hash-wasm
  returns the wider type.
- `cipher.test.ts`: `bytes[0] ^= 1` became `bytes[0] = (bytes[0] ?? 0) ^ 1`, and the
  three-part split goes through a small tuple-asserting helper — both because
  `noUncheckedIndexedAccess` makes the plan's forms type errors in tests, which `tsc`
  also checks.

- NEEDS-REVIEW: `recovery.ts` factors the plan's duplicated "decode and length-check the
  displayed key" block into one private `recoveryKeyBytes` helper used by both
  `deriveRecoveryWrappingKey` and `deriveRecoveryAuthHash`. Identical behaviour and error
  message; done so the two paths can never drift apart in validation.

Suite: 50 tests across 6 files (the plan's own counts, 47, were an estimate).

## Task 1.13 — tRPC vault and account routers

- Vitest does not put `.env` values on `process.env` the way `next dev` does, and the
  router tests import `~/env`, which validates `DATABASE_URL` at module load. `vitest.config.ts`
  now calls `process.loadEnvFile(".env")` (Node built-in, no new dependency) before the
  config is exported. No value is read or printed; the file is only loaded.
- The plan's test helper used `appRouter.createCaller({ db, session } as never)`. Replaced
  with a fully typed context — `Awaited<ReturnType<typeof createTRPCContext>>`, so `db`,
  `session` and `headers` are all real — via the exported `createCaller`. `as never` would
  have hidden any drift between the test's fake session and the real one.
- NEEDS-REVIEW: the session fixture carries sentinel strings in its `protectedVaultKey` /
  `recoveryWrappedVaultKey` / `recoveryVerifier` fields rather than the seeded values.
  Better Auth's session embeds a copy of the user row, so a router could answer `getKeys`
  from the session alone; the sentinels make the database the only source that can satisfy
  the test. Slightly unrealistic fixture, deliberately.
- Ownership is enforced in the SQL `WHERE` clause. Verified by mutation: deleting the
  `.where(eq(user.id, ctx.session.user.id))` makes "never returns another user's key
  material" fail, and nothing else changes.
- `vault.getKeys` returns only `protectedVaultKey` and `kdfVersion`. `recoveryWrappedVaultKey`
  and `recoveryVerifier` are selected nowhere in this router; they belong to the recovery flow.
- `account.status` is presentation only. The authoritative single-account gate stays in the
  Better Auth `databaseHooks.user.create.before` hook, which also covers the public
  `/api/auth/sign-up/email` route.
- Tests run against the real Neon dev database with ids `test-vault-user-a` / `-b` and clean
  up in `afterEach`; the `user` table was verified empty before and after the full suite.

## Crypto module review fixes

- **AAD is required, not optional.** `encryptBytes`/`decryptBytes` and
  `encryptItem`/`decryptItem` take a mandatory `aad: string`. A caller that cannot name
  the context does not know where the data belongs. Items use `itemAad(itemId)`
  (`passio-item-v1:<id>`); the vault key uses `AAD_VAULT_KEY_MASTER` /
  `AAD_VAULT_KEY_RECOVERY`, selected by the `VaultKeyPurpose` argument to
  `wrapVaultKey`/`unwrapVaultKey`. Before this, any ciphertext decrypted in any slot: a
  malicious server could swap or roll back rows undetectably, and the two vault-key
  wrappings (identical plaintext) were interchangeable. The vault has no production rows,
  so the format changed now rather than never.
- **Branded `VaultKey` / `WrappingKey`** (`src/lib/crypto/types.ts`). Every key here is an
  AES-GCM `CryptoKey`, so `encryptItem(item, stretchedKey)` used to compile and round-trip
  while producing items that die at the next password change. One cast per construction
  site; the brands exist only at compile time.
- **The public barrel no longer exports `deriveMasterKey`, `deriveAuthHash` or
  `stretchMasterKey`.** Raw master-key material never leaves the worker, so
  `crypto-worker/derive.ts` imports them from `~/lib/crypto/kdf` directly.
- NEEDS-REVIEW: `unwrapVaultKey` now returns a **non-extractable** key unless the caller
  passes `extractable: true`. Unlock takes the default; only signup and the (still
  unwritten) recovery re-wrap need the raw bytes. A future "change master password" flow
  must remember to opt in.
- **Crockford aliasing.** The decoder now reads `I`/`L` as `1` and `O` as `0`, which is the
  point of a printed key. That made prefix-stripping ambiguous, so `extractPayload` detects
  the `PASSIO-1` prefix by total length (7 + 48 characters) rather than `startsWith`, and
  rejects anything else. The character count is also validated before decoding, so a junk
  character appended to a key no longer decodes to the same bytes.
- **Error taxonomy.** `DecryptionError` now means only "the tag did not verify" — the one
  error a UI may read as "wrong password". Authentic-but-unreadable data (bad JSON, a
  vault key of the wrong length) is a `CipherFormatError`. A mistyped recovery key is a
  `RecoveryKeyError`, which lives in its own module because `encoding.ts` throws it and
  `recovery.ts` imports `encoding.ts`.
- **Worker client.** `deriveInWorker` takes an injectable worker factory (defaulting to the
  real `Worker`), so its message plumbing is now tested; it rejects after
  `DERIVATION_TIMEOUT_MS` (30 s) and on a reply carrying an unknown id, instead of leaving
  the unlock screen spinning forever.
- Derivation inputs are length-checked against `ARGON2_HASH_LEN`: 32 zero bytes previously
  derived a working, attacker-reproducible key.
