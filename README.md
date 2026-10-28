# passio

A zero-knowledge password manager: a web app and a Chrome extension. Your vault is
encrypted and decrypted on your device. The server only ever stores ciphertext and
never sees your master password.

## Features

- Logins, secure notes, cards and fifteen more item types, with custom fields
- TOTP codes, password and username generators, password history
- Import from Bitwarden, LastPass, Chrome/Edge/Brave, Firefox, KeePass and 1Password;
  export to JSON or CSV
- Vault health (weak, reused, old, sent over http) and opt-in breach checking with
  k-anonymity, so your passwords never leave your device
- Chrome extension with inline suggestions and login, card and identity autofill
- A recovery key, shown once at signup, as the only way back in without the master password

## How the encryption works

- **Master key:** Argon2id (64 MiB, 3 iterations, parallelism 4) over your master
  password. It never leaves your device.
- **Login:** the server receives a hash derived from the master key, not the password.
- **Vault key:** a random AES-256-GCM key, stored on the server only in wrapped form:
  once under a key stretched from your master key (HKDF-SHA256) and once under your
  recovery key.
- **Items:** each item is encrypted with AES-GCM using its own id as additional
  authenticated data, so a server cannot swap one item's ciphertext for another's
  without detection.
- **In memory only:** the unlocked vault key is never written to storage or cookies.
  A reload locks the vault. In the extension it lives in an offscreen document,
  non-extractable.
- **No favicons:** item icons are computed from the title, so no third party learns
  which sites you have accounts on.

The full design is in [`docs/superpowers/specs/2026-09-11-passio-design.md`](docs/superpowers/specs/2026-09-11-passio-design.md).
The crypto lives in [`packages/crypto`](packages/crypto) and depends only on
`hash-wasm` and WebCrypto.

## Stack

Next.js (App Router), TypeScript, tRPC, Drizzle, Better Auth, Postgres (Neon),
Tailwind. The extension is Chrome MV3 built with WXT. A pnpm workspace:

```
apps/web          the Next.js app
apps/extension    the Chrome extension
packages/crypto   key derivation and encryption
packages/core     shared vault logic (no React)
packages/ui       design tokens and primitives
packages/vault-ui vault components shared by the web app and the extension
```

## Running it locally

You need Node 24, pnpm 11 and a Postgres database.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # then fill in the three values
pnpm db:push
pnpm dev
```

Open http://localhost:3000/signup. Registration closes after the first account unless
`REGISTRATION_OPEN=true` is set.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`. The tests create and
delete rows, so point them at a throwaway database, never one holding a real vault.

Build the extension with `pnpm --filter @passio/extension build`, then load
`apps/extension/.output/chrome-mv3/` from `chrome://extensions` with Developer mode on.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

Copyright (C) 2026 Philip Angelo Ang.

passio is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you
run a modified version as a service, you must make your changes available to its users.

The bundled fonts, Instrument Sans and JetBrains Mono, are under the SIL Open Font
License 1.1; see `packages/ui/src/fonts/`.
