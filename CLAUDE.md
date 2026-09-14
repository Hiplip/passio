# passio

password manager similar to 1pass or bitwarden - support totp

The global CLAUDE.md already defines the stack, the gates, and the deploy rules.
This file adds only what is specific to this project.

## Design constraints

These apply when designing or planning, before any code exists.

- Every phase of the implementation plan merges to main and deploys live. Each phase
  must leave the app in a working, shippable state on its own.
- Phases are vertical slices, not layers. "Signup works end to end" is a phase.
  "All the database schemas" is not — it deploys nothing a user can reach.
- Target 4 to 8 phases. Fewer and larger beats many and small.
- Each phase names the route or flow that proves it works, so the smoke check
  can cover it.
- This is built unattended by an agent with no one to ask. Ambiguity becomes a guess
  that ships. Prefer over-specification to elegance.
- No phase may depend on work from a later phase.

## Codebase facts

### Commands (exact)

| Purpose | Command |
|---|---|
| Typecheck gate | `pnpm typecheck` (`tsc --noEmit`) |
| Lint gate | `pnpm lint` (`eslint .`) |
| Build gate | `pnpm build` (`next build`) |
| Test gate | `pnpm test` (`vitest run`) |
| Smoke gate | `pnpm smoke` (`bash apps/web/scripts/smoke.sh` via the web workspace) |
| Push schema | `pnpm db:push` |
| Dev server | `pnpm dev` |

### Key paths

- Drizzle schema: `apps/web/src/server/db/schema.ts`; connection: `apps/web/src/server/db/index.ts`
  (uses `postgres-js`, not the Neon HTTP driver)
- Better Auth config: `apps/web/src/server/better-auth/config.ts`
  (siblings: `client.ts`, `server.ts`, `index.ts`)
- tRPC: `apps/web/src/server/api/trpc.ts`, `.../root.ts`, `.../routers/*`
- Env schema: `apps/web/src/env.js` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`)
- **Workspace**: pnpm workspace, `apps/*` + `packages/*`.
  ```
  apps/web          the Next app        (Vercel Root Directory points here)
  apps/extension    the Chrome extension
  packages/crypto   trust-critical crypto
  packages/core     shared vault logic (no React)
  packages/ui       design tokens + shadcn primitives
  packages/vault-ui vault components, shared by BOTH surfaces
  ```

  **`packages/vault-ui` is rendered by the web app and the extension alike.** It
  imports neither Next nor tRPC: navigation and data arrive through two contexts
  (`navigation.tsx`, `data.tsx`) that each surface implements. Adding a `next/*` or
  `~/*` import there breaks the extension build - put it in the adapter instead.

  Tailwind scans via `@source` lines in `packages/ui/src/styles.css`. **Add one for
  every new package that renders markup**: detection anchors at the CSS file, so
  without them a package's classes are purged silently. Measured: 71,008 bytes of CSS
  with them, 29,986 without.
  The repo root holds only workspace-level config: `package.json` (scripts that
  delegate with `--filter`), `pnpm-workspace.yaml`, `vitest.config.ts`,
  `eslint.config.js`, `tsconfig.base.json`, and a `tsconfig.json` that exists solely so
  ESLint's typed rules can resolve `vitest.config.ts`.
- **`pnpm typecheck` is `pnpm -r typecheck`** — every workspace package typechecks under
  its own tsconfig. That is what surfaces an undeclared dependency: `packages/core` was
  importing `@scure/bip39` while only the app declared it, which worked by hoisting and
  would have broken anyone consuming the package alone.
- **Vercel's Root Directory must be `apps/web`**, with "Include source files outside of
  the Root Directory" enabled so the workspace packages resolve.
- Crypto (trust-critical): `packages/crypto/src/*` — imports only `hash-wasm` + WebCrypto.
  Includes the Argon2id Web Worker under `src/worker/`.
- Shared vault logic: `packages/core/src/*` — item schema, TOTP, generator, filter,
  search, mask, decryption, clipboard, URL matching. Depends on `@passio/crypto`; never
  the reverse.
- Both packages are **buildless**: they publish TypeScript source, consumed via
  `transpilePackages` (Next) and natively (Vite, Vitest). A `dist/` here would silently
  shadow a source change in the most trust-critical code in the project.
- `vitest.config.ts` aliases must stay **anchored regexes**. A plain string alias
  prefix-matches, so `"@passio/crypto"` also swallows `@passio/crypto/worker/derive` and
  8 test files stop loading with no other symptom.
- Vitest config: `vitest.config.ts` (`environment: "node"`; component tests opt into jsdom with a
  `// @vitest-environment jsdom` docblock, because jsdom lacks a full WebCrypto)
- Test setup: `apps/web/src/test/setup.ts`
- Smoke script: `apps/web/scripts/smoke.sh`

### Crypto invariants (do not break these)

- **Every ciphertext is bound to its context with AES-GCM additional authenticated
  data.** Item ciphertext uses the item id as AAD; the two vault-key wrappings use
  distinct constant purposes. Without this, a malicious server could swap one item's
  ciphertext for another's, or roll a row back, undetectably.
- **Item ids are generated by the client, not the database.** They have to be: the id
  is the AAD, so it must exist before the item is encrypted. `item.create` takes an id.
- `deriveMasterKey`, `deriveAuthHash` and `stretchMasterKey` are deliberately NOT
  exported from `~/lib/crypto`. They are imported directly from `~/lib/crypto/kdf` by
  the worker, which is inside the trust boundary. Do not re-export them.
- Vault keys and wrapping keys are branded types. If a change makes you want to cast
  between them, the change is wrong.
- A reload re-locks the vault. The key is in memory only - never localStorage,
  sessionStorage, IndexedDB or a cookie.

### Database topology — read this before running tests

Two Neon branches in project `tiny-rain-06343556`:

| Branch | Used by | Contains |
|---|---|---|
| `main` | **production** (Vercel `DATABASE_URL`) | the real vault. Never point tests at it. |
| `dev`  | local `.env` and the whole test suite | disposable |

Local `.env` points at `dev`. Production's URL is set on Vercel only and is deliberately
not in any local file. The test suite creates and deletes rows, so it must never run
against `main`.

#### RULE: every schema change is pushed TWICE, always

`pnpm db:push` only ever applies to the branch `.env` names. Pushing once updates `dev` and
leaves **production running against a schema missing its columns** — which fails at runtime,
not at build time, so no gate catches it.

After any edit to `apps/web/src/server/db/schema.ts`, run both:

```bash
# 1. dev (what local .env points at)
pnpm db:push --force < /dev/null

# 2. production (main branch)
DATABASE_URL="$(neon connection-string main --project-id tiny-rain-06343556)" \
  pnpm db:push --force < /dev/null
```

Then **verify the column actually landed on each branch** by querying
`information_schema.columns`. Do not trust the exit code: drizzle-kit has reported success
on a no-op before. Always redirect stdin from `/dev/null`, or it hangs on a rename prompt
that `--force` does not suppress.

### `pnpm db:push` — fixed, was broken on drizzle-kit 0.30.x

`drizzle-kit@0.30.6` predated PostgreSQL 17's named NOT NULL constraints (Neon runs 18.6),
so it emitted `DROP CONSTRAINT "<table>_<col>_not_null"` for every non-null column, hit a
primary key, aborted having applied nothing, **and still exited 0**. Upgrading to
`0.31.10` fixes it; verified by adding and dropping a real column and confirming both
landed. Do not downgrade below 0.31.

Note it still prompts interactively when it cannot tell a created table from a renamed
one, and `--force` does not suppress that — redirect stdin from `/dev/null` in scripts or
it hangs forever.

### Environment notes

- pnpm 11 requires build approvals in `pnpm-workspace.yaml` (`allowBuilds`), not `package.json`.
- `eslint.config.js` is excluded from `tsconfig.json` (`eslint-plugin-drizzle` ships no types).
- GitHub OAuth was removed from the scaffold: incompatible with the zero-knowledge model
  (an OAuth user has no master password, so no vault key, so an un-unlockable account).
- `vitest.config.ts` calls `process.loadEnvFile("apps/web/.env")`: vitest does not populate
  `process.env` the way `next dev` does, and DB-backed tests import `~/env`, which
  validates `DATABASE_URL` at module load.
- Tests hit the real Neon dev database. Each test creates its own rows and cleans up.
- **`pnpm test` runs single-worker, one file at a time** (`maxWorkers: 1` +
  `fileParallelism: false`, both at ROOT level in `vitest.config.ts`). Do not "optimise"
  this away. The unit project runs Argon2id at 64 MiB across several workers; on this
  8 GB box that starved the database workers and produced a DIFFERENT database test
  failing on roughly one run in three. It read like a data race and was memory pressure.
  Note both options are silently ignored inside a `projects[]` entry - only root works.
  The suite takes about two minutes as a result.
- **The DB tests assume exclusive access to that database.** `vitest.config.ts` splits the
  suite into two projects: `unit` (in-memory, files in parallel) and `db` (single fork, one
  file at a time). That ordering holds *within* one vitest run. It does NOT hold across two
  vitest runs at once - `account.status` answers "does any user exist?", so a second process
  seeding rows makes it fail. Run `pnpm test` on its own; never alongside another test run.
  `pnpm vitest run --project unit` is safe to run at any time.

### Browser extension (`apps/extension/`)

Chrome MV3, built with WXT. Load `apps/extension/.output/chrome-mv3/` via
`chrome://extensions` → Load unpacked.

| Purpose | Command |
|---|---|
| Build the extension | `pnpm --filter @passio/extension build` |
| Watch mode | `pnpm --filter @passio/extension dev` |
| Regenerate WXT types | `pnpm --filter @passio/extension typecheck` (runs `wxt prepare` first) |

**`pnpm test` builds the extension first**, because `apps/extension/manifest.test.ts`
asserts the *generated* manifest. Do not decouple them: the assertion is worthless
against a stale build.

#### The vault key lives in an offscreen document

MV3 evicts the service worker after ~30s idle. `chrome.storage.session` cannot hold a
`CryptoKey` — it serialises as JSON and an exported `ArrayBuffer` becomes `{}` — so the
only usable form is raw bytes, which forces `extractable: true`. That would delete the
invariant the branded types exist to enforce. An offscreen document keeps the key
non-extractable and in memory instead.

Consequences to preserve:

- **`apps/extension/entrypoints/offscreen/` is the only context that ever holds the key.**
  The popup receives `ItemSummary` values with no secrets and asks for one named field
  at a time. The content script receives three strings.
- Argon2id must appear **only** in `assets/worker-*.js` in the build output, and the
  popup chunk must not contain it. If the popup ever links derivation code, something
  imported the wrong module.
- Auto-lock uses `chrome.alarms`, which survives worker eviction. `setTimeout` does not.

#### Permissions are asserted, not just intended

`apps/extension/manifest.test.ts` asserts the exact permission list, the single host
permission, absence of `<all_urls>`, absence of `content_scripts`, presence of
`wasm-unsafe-eval` and of the pinned `key`. **This is the gate that replaces `pnpm smoke`
for the extension** — there is no browser here, so nothing can prove the extension
works, only that it never quietly asks for more than it was designed to.

Changing that list is a design decision: update `docs/superpowers/specs/2026-09-12-passio-extension-design.md` (D3a) in the same commit.

#### The offscreen document can only use `chrome.runtime`

Not `chrome.storage`, not anything else. Reaching for `chrome.storage` there throws
"Cannot read properties of undefined (reading 'local')" at runtime, and it shipped
once. The session token is proxied through the service worker
(`src/token-proxy.ts`), and every `chrome.storage` call lives in
`src/chrome-storage.ts`, which the offscreen document must never import.

`bundle.test.ts` asserts the offscreen document's **whole module graph** uses no API
but `chrome.runtime`. It follows the page's modulepreload links rather than naming a
chunk, because Rolldown hoists shared code and a named chunk can silently become an
8 kB stub that proves nothing.

#### Two traps that cost real time

- **`tldts` defaults to `allowPrivateDomains: false`.** With it off, `github.io` and
  `vercel.app` read as ordinary domains, so `alice.github.io` and `bob.github.io` are
  "the same site" and one tenant's login is offered on another's page. `match.ts` turns
  it on; the test for it must stay.
- **`apps/extension/key.pem` is the private signing key and is gitignored.** The manifest
  `key` field is the public half and is committed. Losing the `.pem` means a new
  extension id, which breaks `trustedOrigins` and the CORS allowlist in
  `apps/web/src/server/cors.ts`. Extension id: `olifgfoaipigflfaiadpjalokaoonjjo`.

### Smoke routes

Phase 1: `/`, `/signup`, `/login` expect **200**; `/unlock`, `/vault` expect a **redirect
(307/302)** because they are protected — a protected route returning 200 to an anonymous request
means the guard is missing. Each later phase appends its own routes.

**What the smoke check does not catch:** a route can return 200 and still render a blank page from
a hydration error, and an auth redirect loop looks healthy at the status-code level. It proves the
app boots and the routes are wired, nothing more. Assertions about content belong in Vitest.
