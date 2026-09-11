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
- NEEDS-REVIEW: KDF parameters are an app-wide constant and the salt is the normalized email.
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
