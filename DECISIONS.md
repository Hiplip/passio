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
