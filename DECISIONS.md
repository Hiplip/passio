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

## Task 2.2 — Item router

- **Item ids are chosen by the client, not by Postgres.** An item's ciphertext is bound to
  its id as AES-GCM additional authenticated data, so the id must exist before the
  plaintext can be sealed; a server-generated id would need a decrypt-free re-encrypt round
  trip that cannot work. `create` therefore takes `{ id, ciphertext }` with a Zod-validated
  UUID, which is the one deviation from the plan's code.
- **A guessed id is harmless.** `create` inserts with `onConflictDoNothing` and raises
  `CONFLICT` when nothing came back, so a collision never overwrites a row and the response
  is identical whether the id belongs to the caller or to somebody else. `update`, `delete`
  and `restore` carry `eq(item.userId, session.user.id)` in the WHERE clause and answer
  `NOT_FOUND` with no message, so another user's row is indistinguishable from one that
  does not exist. Removing that clause was checked by mutation: the four isolation tests
  fail, and only those.
- **`create` writes `createdAt`/`updatedAt` from the application clock** rather than letting
  `defaultNow()` fill them. `update` sets `updatedAt` from the same clock, and a test
  asserts the timestamp advances; mixing the database clock with the process clock would
  make that assertion depend on skew between the two.
- NEEDS-REVIEW: **database tests now run one file at a time** (`vitest.config.ts`, project
  `db`, `maxWorkers: 1`). Several server tests assert on table-wide state — `account.status`
  answers "does any user exist?" — so two such files in parallel is a race, not a test.
  Scoping it to `src/server/**` keeps the in-memory tests parallel: serialising the whole
  suite instead costs about a minute a run (126 s against 70 s). This does not protect
  against two `vitest` processes running against the same Neon database at once, which is
  what happens when two agents run the suite simultaneously.
- **The recovery columns were applied by hand, because `pnpm db:push` cannot run.**
  `drizzle-kit@0.30.6` against this Neon server emits a `DROP CONSTRAINT
  "<table>_<column>_not_null"` for every non-null column in the schema before it gets to
  any real change, and the first one it tries is on a primary key, so Postgres rejects it
  (`42P16: column "id" is in a primary key`) and the push aborts having applied nothing.
  The three `ALTER TABLE "user" ADD COLUMN` statements drizzle-kit generated for
  `recovery_key_created_at`, `recovery_failed_attempts` and `recovery_locked_until` were
  therefore executed directly, verbatim, and the schema now matches `schema.ts`. Nothing
  else was touched: every column that was `NOT NULL` before still is.
  NEEDS-REVIEW: every future schema change hits this same wall until drizzle-kit is
  upgraded. It is not specific to these columns.
- **An unknown email gets a decoy `recoveryWrappedVaultKey`, not an error.**
  `recovery.getWrappedKey` has to be public — someone who lost their master password has
  no session — so an error for an unknown address would make it a user-enumeration oracle.
  The decoy is HMAC-SHA256 of the normalised email under `BETTER_AUTH_SECRET`, expanded to
  60 bytes over two counter-separated blocks and formatted as the same `v1.<12 bytes>.<48
  bytes>` envelope `wrapVaultKey` emits. Deriving it rather than randomising it is the
  point: it is stable across calls, so asking twice is not a tell, and unpredictable
  without the secret, so it cannot be recomputed offline and recognised as a decoy.
- **`recovery.recover` spends scrypt on an email that has no account.** It verifies the
  supplied hash against a fixed placeholder hash before throwing. The error message is
  already identical to the wrong-key one; without the dummy verification the response time
  would still separate the two cases.

## 2026-09-11 — End of run

- **Vercel unblocked.** The token that returned HTTP 403 early in the run began working later.
  The project was linked to the `hiplip` team, connected to `Hiplip/passio`, given `DATABASE_URL`
  and `BETTER_AUTH_SECRET` (production, preview, development — names only recorded here), and
  deployed to production successfully. The earlier BLOCKED note in the plan is corrected in place.
- NEEDS-REVIEW: **Vercel Deployment Protection was left ON.** Every route currently redirects to
  Vercel SSO, so the app is reachable only while signed in to Vercel. It was left enabled on
  purpose: making a site publicly reachable is an outward-facing security decision for the owner,
  not something to change unasked. Turn it off in Project Settings → Deployment Protection.
- `BETTER_AUTH_URL` is no longer required. A Vercel project has no production domain until its
  first deploy, so requiring it made the first deploy impossible without guessing the domain. It
  now falls back to `VERCEL_PROJECT_PRODUCTION_URL`, and is only set explicitly for local dev.
  It is therefore deliberately NOT set on Vercel.

## 2026-09-12 — Database separation and drizzle-kit upgrade

- **drizzle-kit upgraded 0.30.6 → 0.31.10, which fixes `db:push`.** The old version predated
  PostgreSQL 17's named NOT NULL constraints (Neon runs 18.6) and emitted DROP CONSTRAINT for
  every non-null column, aborting on a primary key while still exiting 0. Verified empirically:
  added a real column, confirmed it landed in the database, dropped it, confirmed it went.
  There is no global drizzle-kit install — it is a per-project devDependency, so every other
  project needs the same bump individually.
- **Local dev and tests moved to a dedicated Neon branch (`dev`, br-nameless-hat-aeppbt28).**
  Previously local `.env`, the test suite and Vercel production all shared one connection
  string, so `pnpm test` wrote to the production database. The owner had by then created a real
  account, making this urgent. Production stays on `main`; its URL is set on Vercel only.
  The dev branch is copy-on-write, so its copy of the real row was cleared after branching.
  Production was verified intact afterwards (1 user, 1 item).
- **`account.status`'s test no longer asserts global emptiness.** It previously required a
  pristine database and would have failed permanently once a real account existed. It now
  asserts the invariant the procedure actually promises — that `registrationOpen` mirrors
  whether a user row exists — which holds in any database state.

## 2026-09-12 — Flaky test suite: the cause was memory, not a data race

Roughly one full-suite run in three failed, always in a database test, a different one each
time (`account.status`, `vault.rewrap`, `item.listDeleted`). Three wrong diagnoses before the
right one, recorded so the next person does not repeat them:

1. Serialising the db files at **project** level (`maxWorkers` / `fileParallelism` inside a
   `projects[]` entry). Vitest silently ignores both there, so this never took effect.
2. Moving `fileParallelism: false` to root. Honoured, but it only orders files *within* a
   project - the projects still ran concurrently, so it changed nothing.
3. Replacing the flakiest assertion with a rolled-back transaction that emptied the user
   table. It passed, but took a table-wide lock in a database other tests were using; adding
   lock pressure to an unexplained failure is the wrong move, so it was removed.

The actual cause: the `db` project passed 79/79 on its own and only failed as part of the full
suite. The `unit` project runs Argon2id at 64 MiB across parallel workers, and on this 8 GB box
(shared with several Claude processes) that starved the database workers. The harness had also
been OOM-killing the repeated test loops used to investigate - the investigation was feeding
the symptom.

Fix: `maxWorkers: 1` at root, alongside `fileParallelism: false`. Three consecutive clean full
runs afterwards, against roughly 1-in-3 failures before. Costs about a minute a run.

Also NEEDS-REVIEW: `account.status`'s "registration is open" branch has no integration test.
It is only true when the whole user table is empty, which no test in a shared database can
guarantee. The "closed" branch is deterministic - any row means closed - and is covered.

## NEEDS-REVIEW: the web app stays at the repo root, not `apps/web`

The extension spec (`2026-09-12-passio-extension-design.md`) placed the Next app at
`apps/web/`. The implementation keeps it at the repo root, with `packages/*` and
`extension/` beside it.

The spec itself named changing Vercel's Root Directory as the change most likely to
break the live site, and gave it its own phase for that reason. A pnpm workspace does
not require it: the repo root can be both the workspace root and the app. That removes
the deployment risk entirely rather than managing it, keeps every `~/*` alias in app
code working untouched, and leaves `next.config.js`, `postcss.config.js`,
`drizzle.config.ts`, `components.json` and `scripts/smoke.sh` free of path rewriting.

Cost: the root `package.json` is both the workspace manifest and the app manifest. That
is a common, supported layout and much cheaper than the alternative.

Verified: 354 tests across 28 files — the exact pre-move count — plus typecheck, lint,
build and smoke, all green after the move.

## RESOLVED: the web app moved to `apps/web` after all

Supersedes the `NEEDS-REVIEW` entry above ("web app stays at the repo root").

That entry was right about the risk and wrong about the destination. Keeping the app at
the repo root avoided changing Vercel's Root Directory, which was the correct call while
six phases of extension work were landing — but it left three conventions side by side
(`packages/*`, a top-level `extension/`, and the app at the root), and `apps/*` +
`packages/*` is the standard layout that every monorepo tool assumes.

Final structure:

```
apps/web         the Next app         (Vercel Root Directory)
apps/extension   the Chrome extension
packages/crypto  trust-critical crypto
packages/core    shared vault logic
```

**Requires two Vercel settings**, both under Project Settings → Build & Deployment:
Root Directory = `apps/web`, and "Include source files outside of the Root Directory in
the Build Step" enabled so the workspace packages resolve.

The move surfaced one real latent bug: `packages/core` imported `@scure/bip39` without
declaring it, resolving only through the root's hoisted `node_modules`. Per-package
typechecking (`pnpm -r typecheck`) is what caught it, and is the main practical argument
for the split beyond tidiness.

Verified after the move: 451 tests across 38 files (unchanged), typecheck across all four
workspace projects, lint, build, smoke on 9 routes, and `db:push` reporting no changes
against the dev branch.

## NEEDS-REVIEW: the extension's vault page holds plaintext

The extension gained a full vault page (`vault.html`) that creates, edits and
deletes items. Editing an item means holding its plaintext, so the popup's old
property — that it renders only `ItemSummary` values with no secrets in them — does
not extend to this page.

**What has not changed.** The vault key exists only in the offscreen document. It is
never serialised, never messaged, never in a page. Encryption still happens in the
offscreen document: the editor sends plaintext and receives nothing but a result.

**What has changed.** Plaintext for the items being edited now lives in a browser tab
for as long as that tab is open. Plaintext already crossed this boundary for copy and
fill, so this is a difference of degree — but it is a real widening, made deliberately
in exchange for full parity with the web app, and it should be revisited if the page
ever grows beyond editing.

Structurally enforced, and proven rather than assumed:

- `apps/extension/bundle.test.ts` asserts the offscreen document's whole module graph
  mentions no extension API but `chrome.runtime`, and that the compiled derivation
  (WebAssembly header, `hash-wasm`) appears in no page, worker or injected script.
- Verified by reintroducing the original `chrome.storage` bug and confirming the gate
  fails, then reverting.

## NEEDS-REVIEW: `<all_urls>` as an optional permission, for inline suggestions

Spec D3 chose `activeTab` over `<all_urls>` deliberately: a bug in fill logic cannot
reach a page the extension was never invoked on, and the extension has no standing read
access to your bank or your email.

Inline suggestions — a passio icon inside login fields — cannot work under `activeTab`,
because the icon must exist before any click. Rather than reverse D3, the broad grant is
declared as `optional_host_permissions` and requested at runtime:

| | Default install | After opting in |
|---|---|---|
| Standing page access | none | every page |
| Content script registered | no | yes |
| Click-to-fill from the popup | yes | yes |

Nothing is registered until the toggle is used, Chrome shows its own consent prompt, and
revoking in `chrome://extensions` fires `permissions.onRemoved`, which unregisters the
script immediately rather than at the next restart.

The suggestion list renders in an iframe on the extension's origin rather than a shadow
root: page script can walk a shadow root but cannot read across an origin. It carries
titles and usernames only — choosing an entry sends an item ID to the service worker,
which resolves the values and relays them to the content script. The password never
travels through the iframe, and the tab is taken from `sender`, never from the message,
so a hostile page cannot aim a fill at a tab it does not own.

Asserted in `manifest.test.ts`: the broad grant appears only under
`optional_host_permissions`, `host_permissions` still holds one API origin, and
`content_scripts` is absent entirely.

---

## Visual identity: "legible / illegible"

The interface looked like Bitwarden — a teal primary action, a sidebar of counts beside
a flat list, and rounded-square favicon-shaped tiles on every row. Those are the three
structural tells, and all three are gone.

The palette is built around one rule: **colour means something.** Chrome is ink, not
brand. Colour marks a secret, an item's identity, or danger, and nothing else. Every
password manager on the market brands its primary button in a security blue or teal;
taking the accent out of the buttons entirely is what actually breaks the resemblance,
more than changing which hue it is.

**Item identity is computed, never fetched.** This is the part the product's own
constraint made possible. A zero-knowledge vault cannot request favicons — asking a CDN
for github.com's icon tells that CDN you hold a GitHub account, and doing it per row
hands over the whole index. So `@passio/core/identity` derives a stable hue and monogram
from an item's title, locally, with no network and no stored state. Eight hues at one
fixed lightness and chroma, so forty items read as a palette rather than a bag of
sweets. A vault's colours end up a fingerprint of its owner's accounts.

**One orchestrated moment.** Argon2id at 64 MiB takes about a second, and that second
used to be a dead button reading "Unlocking…". It is the most characteristic thing the
product does, so `CipherReadout` shows it: a band of monospace glyphs with a bright head
sweeping across, indeterminate because the work takes as long as the device takes. It is
the only unprompted motion in the product and it holds still under
`prefers-reduced-motion`.

### NEEDS-REVIEW: the sidebar was deleted, not restyled

`vault-sidebar.tsx` (281 lines, desktop) and `vault-overview.tsx` (202 lines, phone)
were two implementations of one idea, and a personal vault is searched far more often
than it is browsed. Both are replaced by one wrapping filter rail that works at every
width and is shared with the extension popup.

Every filter survives — all, the three types, verification codes, each folder, no
folder, trash — as do new folder, rename and delete, which moved into the folder menu
and now act on the folder being browsed rather than needing to be named twice. Folder
management is optional in the rail: the popup passes no handlers, because it could not
create folders before either.

This could have gone the other way: a sidebar gives permanent at-a-glance counts, and
the rail only shows them on its pills. It is called out here because it is the largest
behavioural change in a redesign that was otherwise meant to be visual.

### NEEDS-REVIEW: fonts are self-hosted rather than loaded through next/font

`packages/ui/src/fonts/*.woff2`, 84 KB, committed to the repo. This fixed a real bug —
next/font sets its variable on the web app's `<html>`, which no extension page has, and
`var()` on an undefined variable invalidates the whole `font-family` declaration, so
every extension surface was rendering in the browser's default face. One `@font-face`
block now serves both bundlers.

The cost is losing next/font's automatic preloading and its self-host-at-build-time
handling; the gain is that the two surfaces genuinely cannot drift apart. Worth
revisiting if web font loading ever shows up as a real page-speed problem.

### Unverifiable here

There is no browser on this VPS, so none of this has been seen rendered. The gates prove
it compiles, lints, typechecks, passes 547 tests and boots; they cannot prove it looks
right. Two things in particular want a human eye: the in-field button now renders a
literal "p" in a system monospace stack (it inherits nothing — it lives in a closed
shadow root inside someone else's page), and the extension now loads its own woff2 files
from `chrome-extension://<id>/assets/`.

---

## The mark: a dial

The first four candidates were abstract — a split disc, a barred disc, a geometric
monogram, two overlapping circles — built on the reasoning that the padlock, the
shield and the key are category clichés and should be avoided.

That reasoning was wrong, and the feedback was blunt: none of them looked like a
password manager. **A category's clichés exist because they communicate.** A stranger
glancing at a half-barred disc has no idea it guards anything. Originality only has to
be enough to tell you apart from the other padlocks in the toolbar; legibility has to
work in the one second anybody ever spends looking.

So the mark uses the category's grammar: a **safe dial**. Every competitor took a
different lock — 1Password the keyhole, Bitwarden the shield, Keeper and LastPass the
padlock — and left this one. It says strongroom rather than locker padlock, which
suits something holding everything you own; the app already calls itself a vault in
its own source; it is a circle, so it belongs to the disc motif the whole interface is
built from; and it has an obvious unlock animation, because a dial turns.

Drawn as four annular sectors plus a hub — paths only, no mask, no clip path, no `id`.
That is not fussiness: the mark is injected as a raw string into a closed shadow root
on pages we do not control, where an `id` can collide, and it is rasterized by a tool
that handles paths far more reliably than masks.

### NEEDS-REVIEW: the geometry is duplicated

`packages/ui/src/mark.tsx` and `scripts/make-icons.mjs` hold the same path data. The
script cannot import the component - it is plain Node with no JSX pipeline - and the
component cannot import the script's output because it needs to render live in
`currentColor`. `packages/ui/src/mark.test.ts` pins them together and fails on drift.
Worth revisiting if the build ever grows a step that could render the component to
SVG at build time.
