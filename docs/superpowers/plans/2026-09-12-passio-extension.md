# passio Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome MV3 extension that fills logins on the sites you visit, sharing the
web client's crypto byte-for-byte and keeping the vault key non-extractable and in
memory.

**Architecture:** The repo becomes a pnpm workspace. `@passio/crypto` and `@passio/core`
are extracted from `src/lib/` and consumed by both the Next app and the extension. In
the extension, a single offscreen document is the only context that ever holds the
vault key; the popup asks it for plaintext, the content script receives one field value
at a time, and the service worker only routes messages and runs the auto-lock alarm.

**Tech Stack:** pnpm workspaces · WXT · React 19 · MV3 offscreen documents · Better Auth
bearer plugin · tRPC · tldts · Vitest + jsdom

**Spec:** `docs/superpowers/specs/2026-09-12-passio-extension-design.md`

---

## DEVIATION FROM SPEC — read this first

The spec places the Next app at `apps/web/`. **This plan keeps it at the repo root.**

The spec itself identified changing Vercel's Root Directory as the single change most
likely to break the live site, and gave it its own phase for that reason. A pnpm
workspace does not require it: the repo root can be both the workspace root and the Next
app, with `packages/*` and `extension/` beside it. This is a supported layout.

What this buys:

- **No Vercel project setting changes at all.** The deployment risk the spec called out
  simply does not arise.
- `~/*` path aliases in every existing app file keep working untouched.
- `next.config.js`, `postcss.config.js`, `components.json`, `drizzle.config.ts` and
  `scripts/smoke.sh` need no path rewriting.
- The Phase 1 diff is confined to moved library files and their import specifiers.

Nothing user-facing changes, and no decision the user approved is affected. Record this
in `DECISIONS.md` as `NEEDS-REVIEW` during Task 6.

---

## File structure

```
passio/
├── package.json              workspace root AND the Next app (unchanged name: "passio")
├── pnpm-workspace.yaml       gains: packages: [packages/*, extension]
├── vitest.config.ts          root config; projects widened to cover packages/
├── eslint.config.js          gains packages/ and extension/ to the typed program
├── next.config.js            gains transpilePackages
│
├── packages/
│   ├── crypto/               @passio/crypto — trust-critical, hash-wasm + WebCrypto only
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          (from src/lib/crypto/index.ts, unchanged)
│   │       ├── cipher.ts  constants.ts  encoding.ts  errors.ts
│   │       ├── kdf.ts  recovery.ts  types.ts  vault-key.ts
│   │       ├── *.test.ts          (all existing crypto tests, unchanged)
│   │       └── worker/
│   │           ├── client.ts      (from src/lib/crypto-worker/client.ts)
│   │           ├── derive.ts      (from src/lib/crypto-worker/derive.ts)
│   │           ├── worker.ts      (from src/lib/crypto-worker/worker.ts)
│   │           └── *.test.ts
│   │
│   └── core/                 @passio/core — vault domain logic, depends on crypto
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── schema.ts  totp.ts  generator.ts  actions.ts  filter.ts
│           ├── search.ts  mask.ts  decrypt-vault.ts  decrypt-folders.ts
│           ├── clipboard.ts
│           ├── match.ts           NEW in Phase 4 — matchItemsToUrl
│           └── *.test.ts
│
├── extension/                @passio/extension — WXT, Chrome MV3
│   ├── package.json
│   ├── tsconfig.json         path alias "@web/*" -> "../src/*" for type-only imports
│   ├── wxt.config.ts         manifest lives here; WXT generates manifest.json
│   ├── manifest.test.ts      asserts the generated manifest, Phase 2
│   └── entrypoints/
│       ├── background.ts     service worker: router, badge, alarm
│       ├── offscreen/        the ONLY holder of the vault key
│       │   ├── index.html
│       │   └── main.ts
│       ├── popup/
│       │   ├── index.html
│       │   └── main.tsx
│       └── fill.content.ts   injected on click only, Phase 5
│   └── src/
│       ├── messages.ts       request/response union + zod, Phase 3
│       ├── custody.ts        key custody state machine, pure, Phase 3
│       ├── api.ts            tRPC client + bearer token, Phase 2/3
│       ├── auth.ts           sign-in, token storage, Phase 2
│       ├── fields.ts         findLoginFields, Phase 5
│       └── fill.ts           fillField native-setter, Phase 5
│
└── src/                      the Next app, unchanged location
    └── lib/                  crypto/ items/ clipboard.ts crypto-worker/ all REMOVED
```

### Import rewrites applied across the app in Task 4

| Old | New |
|---|---|
| `~/lib/crypto` | `@passio/crypto` |
| `~/lib/crypto/kdf` | `@passio/crypto/kdf` |
| `~/lib/crypto/types` | `@passio/crypto/types` |
| `~/lib/crypto-worker/client` | `@passio/crypto/worker/client` |
| `~/lib/crypto-worker/derive` | `@passio/crypto/worker/derive` |
| `~/lib/items/<name>` | `@passio/core/<name>` |
| `~/lib/clipboard` | `@passio/core/clipboard` |

Relative imports *inside* the moved files (`./cipher`, `./kdf`, `./schema`) are unchanged
by the move. That is the point: a correct Phase 1 diff shows moved paths and changed
import specifiers, and nothing else.

---

# PHASE 1 — Monorepo split

**Proves:** all 354 tests still green, production still deploys, the web app is
behaviourally identical.

**Deploys:** yes (push to main at the end; Vercel redeploys unchanged app code).

---

### Task 1: Workspace scaffolding

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `packages/crypto/package.json`, `packages/crypto/tsconfig.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`

- [ ] **Step 1: Declare the workspace**

`pnpm-workspace.yaml` — add `packages:` above the existing keys, keep the rest:

```yaml
packages:
  - packages/*
  - extension

allowBuilds:
  esbuild: true
  unrs-resolver: true
onlyBuiltDependencies:
  - esbuild
  - unrs-resolver
```

`extension` is listed now even though it does not exist until Phase 2. pnpm tolerates a
missing workspace entry; adding it now means Phase 2 touches one fewer file.

- [ ] **Step 2: Create `packages/crypto/package.json`**

```json
{
  "name": "@passio/crypto",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*.ts"
  },
  "dependencies": {
    "hash-wasm": "^4.12.0"
  }
}
```

No build step. The package publishes TypeScript source and consumers compile it — Next
via `transpilePackages`, WXT via Vite, Vitest natively. A build step here would mean a
stale `dist/` silently shadowing a source change in the most trust-critical code in the
project.

The `"./*"` pattern matches across slashes, so `@passio/crypto/worker/client` resolves to
`./src/worker/client.ts`.

**`hash-wasm` is the only dependency, and that is a rule, not an accident.** If a later
change wants to add a second one, that is a signal the change belongs in `@passio/core`.

- [ ] **Step 3: Create `packages/crypto/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {},
    "plugins": []
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`paths` and `plugins` are cleared deliberately: this package must not be able to reach
back into the app via `~/*`, and the Next TS plugin does not apply to it.

- [ ] **Step 4: Create `packages/core/package.json`**

```json
{
  "name": "@passio/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./*": "./src/*.ts"
  },
  "dependencies": {
    "@passio/crypto": "workspace:*",
    "otpauth": "^9.5.2",
    "zod": "^3.24.2"
  }
}
```

No `"."` export: every consumer imports a named module (`@passio/core/schema`), which
mirrors how `~/lib/items/*` is imported today and keeps the move mechanical.

- [ ] **Step 5: Create `packages/core/tsconfig.json`**

Identical to crypto's:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {},
    "plugins": []
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml packages/
git commit -m "chore(workspace): declare the pnpm workspace and two shared packages"
```

---

### Task 2: Move the crypto package

**Files:**
- Move: `src/lib/crypto/*` → `packages/crypto/src/*`
- Move: `src/lib/crypto-worker/*` → `packages/crypto/src/worker/*`

- [ ] **Step 1: Move with git so history follows**

```bash
mkdir -p packages/crypto/src/worker
git mv src/lib/crypto/* packages/crypto/src/
git mv src/lib/crypto-worker/* packages/crypto/src/worker/
rmdir src/lib/crypto src/lib/crypto-worker
```

`crypto-worker` moves into the crypto package rather than staying in the app because the
extension's offscreen document needs Argon2id derivation too, and because keeping the
worker inside the package reinforces the existing rule that `deriveMasterKey`,
`deriveAuthHash` and `stretchMasterKey` are never re-exported from the barrel — they now
physically cannot be reached from outside the package except through `index.ts`.

- [ ] **Step 2: Fix the one cross-boundary import inside the moved worker**

`packages/crypto/src/worker/derive.ts` currently reads:

```ts
import { deriveAuthHash, deriveMasterKey, stretchMasterKey } from "~/lib/crypto/kdf";
import type { WrappingKey } from "~/lib/crypto/types";
```

Replace with relative imports, which is what they should always have been now that they
live in the same package:

```ts
// Imported from the module directly, not the public barrel: these three touch
// raw master-key material, which never leaves this worker.
import { deriveAuthHash, deriveMasterKey, stretchMasterKey } from "../kdf";
import type { WrappingKey } from "../types";
```

- [ ] **Step 3: Check for any other `~/` import inside the package**

```bash
grep -rn '~/' packages/crypto/src/ || echo "clean: no app imports remain"
```

Expected: `clean: no app imports remain`. Anything found is a genuine leak of app
concerns into the trust boundary and must be resolved before continuing, not worked
around with a path alias.

- [ ] **Step 4: Commit**

```bash
git add -A packages/crypto src/lib
git commit -m "refactor(crypto): move the crypto module into @passio/crypto"
```

---

### Task 3: Move the core package

**Files:**
- Move: `src/lib/items/*` → `packages/core/src/*`
- Move: `src/lib/clipboard.ts`, `src/lib/clipboard.test.ts` → `packages/core/src/`

- [ ] **Step 1: Move**

```bash
mkdir -p packages/core/src
git mv src/lib/items/* packages/core/src/
git mv src/lib/clipboard.ts src/lib/clipboard.test.ts packages/core/src/
rmdir src/lib/items
```

`clipboard.ts` moves because the extension popup needs the same copy-with-auto-clear
behaviour, and duplicating a security-relevant timeout in two clients is how they drift.

- [ ] **Step 2: Rewrite crypto imports inside core**

`decrypt-vault.ts` and `decrypt-folders.ts` import from `~/lib/crypto`. Rewrite to the
package specifier:

```bash
cd packages/core/src
sed -i 's#from "~/lib/crypto"#from "@passio/crypto"#g' *.ts
sed -i 's#from "~/lib/crypto/\([a-z-]*\)"#from "@passio/crypto/\1"#g' *.ts
cd ../../..
grep -rn '~/' packages/core/src/ || echo "clean: no app imports remain"
```

Expected: `clean: no app imports remain`.

- [ ] **Step 3: Commit**

```bash
git add -A packages/core src/lib
git commit -m "refactor(core): move item logic and clipboard into @passio/core"
```

---

### Task 4: Rewrite the app's imports

**Files:**
- Modify: every file under `src/` importing the moved modules
- Modify: `package.json` (add the two workspace deps)

- [ ] **Step 1: Add the workspace dependencies**

In the root `package.json` `dependencies`, add:

```json
"@passio/core": "workspace:*",
"@passio/crypto": "workspace:*",
```

and **remove** `hash-wasm` and `otpauth`, which are now owned by the packages that use
them. `zod` stays: the app uses it directly for tRPC input validation.

- [ ] **Step 2: Rewrite every import specifier**

```bash
grep -rl '~/lib/\(crypto\|items\|clipboard\)' src/ | while read -r f; do
  sed -i \
    -e 's#"~/lib/crypto-worker/\([a-z-]*\)"#"@passio/crypto/worker/\1"#g' \
    -e 's#"~/lib/crypto/\([a-z-]*\)"#"@passio/crypto/\1"#g' \
    -e 's#"~/lib/crypto"#"@passio/crypto"#g' \
    -e 's#"~/lib/items/\([a-z-]*\)"#"@passio/core/\1"#g' \
    -e 's#"~/lib/clipboard"#"@passio/core/clipboard"#g' \
    "$f"
done
grep -rn '~/lib/\(crypto\|items\|clipboard\)' src/ || echo "clean: all imports rewritten"
```

Expected: `clean: all imports rewritten`.

Order matters in that sed: `crypto-worker` must be rewritten before `crypto`, or the
shorter pattern eats the prefix.

- [ ] **Step 3: Install so pnpm links the workspace packages**

```bash
pnpm install
```

Expected: pnpm reports the two local packages linked. `node_modules/@passio/crypto`
becomes a symlink to `packages/crypto`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/
git commit -m "refactor: import crypto and core from their workspace packages"
```

---

### Task 5: Rewire the tooling

**Files:**
- Modify: `next.config.js`
- Modify: `vitest.config.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: `next.config.js` — transpile the source-only packages**

```js
/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // @passio/crypto and @passio/core publish TypeScript source, not a build. They
  // are deliberately buildless: a stale dist/ shadowing a source change in the
  // crypto package is precisely the failure nobody would notice.
  transpilePackages: ["@passio/crypto", "@passio/core"],
};

export default config;
```

- [ ] **Step 2: `vitest.config.ts` — widen the projects, keep the concurrency rules**

Only the two `include`/`exclude` blocks and the alias change. **`maxWorkers: 1` and
`fileParallelism: false` stay exactly where they are, at root.** Both are silently
ignored inside a `projects[]` entry, and moving them is how the flaky suite came back.

```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

if (existsSync(".env")) process.loadEnvFile(".env");

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Explicit, not tsconfigPaths: a workspace has several tsconfigs and the
    // root config has to resolve every project's imports the same way.
    alias: {
      "~": r("./src"),
      "@passio/crypto": r("./packages/crypto/src/index.ts"),
      "@passio/core": r("./packages/core/src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // One worker, one file at a time, across the WHOLE run. See CLAUDE.md.
    // `fileParallelism` alone only serialises files within a project, and the
    // projects still ran concurrently - so the unit project's Argon2id tests
    // (64 MiB each, several at once) starved the database workers on this
    // 8 GB box. That looked like a data race and was memory pressure.
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            "packages/*/src/**/*.test.ts",
            "extension/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "src/server/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["src/server/**/*.test.ts", "src/server/**/*.test.tsx"],
        },
      },
    ],
  },
});
```

Note the alias asymmetry: `@passio/crypto` maps to `index.ts` because it has a `"."`
export, while `@passio/core` maps to the directory because it only has subpath exports.
Getting this backwards produces "cannot find module @passio/core/schema".

- [ ] **Step 3: `eslint.config.js` — bring the packages into the typed program**

Change only the `ignores` entry, adding build output that will exist from Phase 2:

```js
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "drizzle/**",
      "extension/.wxt/**",
      "extension/.output/**",
    ],
  },
```

`projectService: true` discovers each package's `tsconfig.json` automatically, so no
further change is needed.

- [ ] **Step 4: Run the full gate set**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke
```

Expected: typecheck clean, lint clean, **354 tests passed across 28 files**, build
succeeds, smoke reports 9 routes alive.

The test count is the real assertion here. Phase 1 adds no tests and removes none — a
different number means a test file stopped being collected, which the `include` globs
make easy to do silently.

- [ ] **Step 5: Commit**

```bash
git add next.config.js vitest.config.ts eslint.config.js
git commit -m "chore(build): teach next, vitest and eslint about the workspace"
```

---

### Task 6: Document and ship Phase 1

**Files:**
- Modify: `CLAUDE.md` (Codebase facts → Key paths)
- Modify: `DECISIONS.md`

- [ ] **Step 1: Update the key paths in `CLAUDE.md`**

Replace the `Crypto (trust-critical)` line and add the workspace note:

```markdown
- Workspace: pnpm workspace. The Next app is the repo ROOT (not `apps/web`), with
  `packages/crypto`, `packages/core` and `extension` beside it. Keeping the app at the
  root means Vercel's Root Directory setting never changes.
- Crypto (trust-critical): `packages/crypto/src/*` — imports only `hash-wasm` +
  WebCrypto. Includes the Argon2id Web Worker under `src/worker/`.
- Shared vault logic: `packages/core/src/*` — item schema, TOTP, generator, filter,
  search, mask, decryption, clipboard. Depends on `@passio/crypto`; never the reverse.
- Both packages are buildless: they publish TypeScript source, consumed via
  `transpilePackages` (Next) and natively (Vite, Vitest).
```

- [ ] **Step 2: Record the layout deviation in `DECISIONS.md`**

```markdown
## NEEDS-REVIEW: web app stays at the repo root, not apps/web

The extension spec placed the Next app at `apps/web/`. The plan keeps it at the repo
root, with `packages/*` and `extension/` beside it.

The spec named changing Vercel's Root Directory as the change most likely to break the
live site. A pnpm workspace does not require it — the root can be both the workspace
root and the app. That removes the deployment risk entirely, keeps every `~/*` alias in
app code working, and leaves next/postcss/drizzle/smoke configs untouched.

Cost: the root `package.json` is both workspace manifest and app manifest. That is a
common and supported layout, and cheaper than the alternative.
```

- [ ] **Step 3: Re-run the gates and push**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke && \
  git add -A && \
  git commit -m "docs: record the workspace layout and its deviation from the spec" && \
  git push origin main
```

- [ ] **Step 4: Confirm the deploy**

```bash
vercel ls --scope hiplip | head -20
```

Expected: the newest deployment reaches **Ready**. A failed deploy is a failed phase —
fix it before Phase 2 and count it against the 3-attempt limit.


---

# PHASE 2 — Extension shell and sign-in

**Proves:** the extension loads in Chrome, reaches the API across origins, authenticates
with a bearer token, and — critically — **runs Argon2id WebAssembly under the MV3 CSP**.

**Deploys:** yes (the server gains `trustedOrigins` and CORS).

**Design note.** Signing in and unlocking are the *same* Argon2id pass:
`performDerivation` returns `{ authHash, stretchedKey }` from one derivation.
`authHash` signs in; `stretchedKey` unwraps the vault key. Phase 2 uses the first and
discards the second. Phase 3 keeps both. This is why there is no separate "unlock
password" prompt anywhere in the design.

---

### Task 7: Scaffold WXT and pin the extension identity

**Files:**
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/wxt.config.ts`
- Create: `extension/entrypoints/popup/index.html`, `extension/entrypoints/popup/main.tsx`
- Create: `extension/entrypoints/background.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install WXT and React support into the extension workspace**

```bash
mkdir -p extension/entrypoints/popup
cd extension && pnpm init && cd ..
pnpm --filter @passio/extension add -D wxt @wxt-dev/module-react
pnpm --filter @passio/extension add react react-dom @passio/core @passio/crypto \
  @trpc/client superjson zod
pnpm --filter @passio/extension add -D @types/chrome @types/react @types/react-dom
```

- [ ] **Step 2: Generate the signing key and derive the extension ID**

The extension ID is the first 32 bytes of SHA-256 over the DER public key, mapped
`0-9a-f` → `a-p`. It must be stable, because it appears in `trustedOrigins` and the CORS
allowlist.

```bash
openssl genrsa 2048 > extension/key.pem 2>/dev/null
PUBKEY=$(openssl rsa -in extension/key.pem -pubout -outform DER 2>/dev/null | base64 -w0)
EXT_ID=$(openssl rsa -in extension/key.pem -pubout -outform DER 2>/dev/null \
  | sha256sum | head -c32 | tr '0-9a-f' 'a-p')
echo "EXT_ID=$EXT_ID"
printf 'PUBKEY=%s\n' "$PUBKEY" > extension/.identity
printf 'EXT_ID=%s\n'  "$EXT_ID" >> extension/.identity
```

`extension/.identity` is committed — it holds only the public key and the derived ID,
both of which ship inside the extension anyway. `extension/key.pem` is the **private**
key and must never be committed.

- [ ] **Step 3: Protect the private key**

Append to `.gitignore`:

```
# Extension signing key. The manifest "key" field is the PUBLIC half and is
# committed; this is the private half that signs a packaged build.
*.pem
extension/.output
extension/.wxt
```

Verify before the first commit of this phase:

```bash
git check-ignore -v extension/key.pem
```

Expected: a line naming `.gitignore` and the `*.pem` rule. **If this prints nothing, stop
and fix `.gitignore` before committing anything.**

- [ ] **Step 4: Write `extension/package.json`**

```json
{
  "name": "@passio/extension",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "postinstall": "wxt prepare"
  }
}
```

Dependencies are added by Step 1; do not hand-write them.

- [ ] **Step 5: Write `extension/wxt.config.ts`**

Substitute the real `PUBKEY` from `extension/.identity` into the `key` field.

```ts
import { readFileSync } from "node:fs";
import { defineConfig } from "wxt";

/** The committed public half of the signing key. Pinning it fixes the extension
 *  ID, which appears in Better Auth `trustedOrigins` and the CORS allowlist - an
 *  unpinned ID silently changes on reload and auth stops working. */
const PUBLIC_KEY = readFileSync(
  new URL("./.identity", import.meta.url), "utf8",
).match(/^PUBKEY=(.*)$/m)![1]!;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  manifest: {
    name: "passio",
    description: "Fill logins from your passio vault.",
    version: "0.1.0",
    key: PUBLIC_KEY,
    permissions: [
      "offscreen",  // the document that holds the vault key
      "storage",    // session token + auto-lock preference
      "alarms",     // auto-lock that survives worker eviction
      "idle",       // lock when the system locks
      "activeTab",  // touch the current tab, only after a click
      "scripting",  // inject the fill function
      "tabs",       // read the active tab URL for the badge
    ],
    host_permissions: ["https://passio-hiplip.vercel.app/*"],
    content_security_policy: {
      // hash-wasm is WebAssembly. Without wasm-unsafe-eval it does not load at
      // all, and Argon2id is the first thing the popup does.
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // Deliberately absent: externally_connectable. The extension signs in on its
    // own, so no web page ever needs to message it. See spec D6.
  },
});
```

- [ ] **Step 6: Write `extension/tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@web/*": ["../src/*"]
    },
    "jsx": "react-jsx"
  },
  "include": ["**/*.ts", "**/*.tsx", ".wxt/**/*"],
  "exclude": ["node_modules", ".output"]
}
```

`@web/*` exists for **type-only** imports of the tRPC router. A value import through it
would pull server code into the bundle; Task 10 guards against that.

- [ ] **Step 7: Minimal entrypoints so the build has something to do**

`extension/entrypoints/background.ts`:

```ts
export default defineBackground(() => {
  // Phase 3 turns this into the message router and alarm holder.
});
```

`extension/entrypoints/popup/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>passio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`extension/entrypoints/popup/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";

function App() {
  return <main style={{ width: 360, padding: 16 }}>passio</main>;
}

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 8: Build**

```bash
pnpm --filter @passio/extension build
```

Expected: WXT writes `extension/.output/chrome-mv3/`. Confirm the manifest exists:

```bash
test -f extension/.output/chrome-mv3/manifest.json && echo "manifest generated"
```

- [ ] **Step 9: Commit**

```bash
git add extension .gitignore
git commit -m "feat(extension): scaffold the MV3 extension with a pinned identity"
```

---

### Task 8: Assert the manifest, so permission creep cannot land silently

This is the gate that replaces `pnpm smoke` for the extension. "Minimal permissions" is
not a testable phrase; a list is.

**Files:**
- Create: `extension/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Asserts the GENERATED manifest, not the config that produces it.
 *
 * There is no browser on this machine, so nothing here can prove the extension
 * works. What it can prove is that the extension never quietly asks for more
 * than it was designed to - which is the regression most likely to go unnoticed
 * in a project whose whole point is not being trusted with more than necessary.
 *
 * Requires `pnpm --filter @passio/extension build` to have run.
 */
const manifest = JSON.parse(
  readFileSync(
    new URL("./.output/chrome-mv3/manifest.json", import.meta.url),
    "utf8",
  ),
) as {
  key?: string;
  permissions?: string[];
  host_permissions?: string[];
  content_security_policy?: { extension_pages?: string };
  externally_connectable?: unknown;
  manifest_version: number;
};

describe("generated manifest", () => {
  it("is manifest v3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("requests exactly the designed permission set", () => {
    // Sorted so the assertion does not depend on declaration order. Changing
    // this list is a design decision - update the spec's D3a table with it.
    expect([...(manifest.permissions ?? [])].sort()).toEqual([
      "activeTab",
      "alarms",
      "idle",
      "offscreen",
      "scripting",
      "storage",
      "tabs",
    ]);
  });

  it("reaches exactly one origin, and it is the API", () => {
    expect(manifest.host_permissions).toEqual([
      "https://passio-hiplip.vercel.app/*",
    ]);
  });

  it("never requests broad host access", () => {
    const all = JSON.stringify([
      manifest.permissions,
      manifest.host_permissions,
    ]);
    expect(all).not.toContain("<all_urls>");
    expect(all).not.toContain("*://*/*");
    expect(all).not.toContain("http://*/*");
    expect(all).not.toContain("https://*/*");
  });

  it("allows WebAssembly, or hash-wasm cannot load", () => {
    expect(manifest.content_security_policy?.extension_pages).toContain(
      "wasm-unsafe-eval",
    );
  });

  it("does not allow remote script", () => {
    const csp = manifest.content_security_policy?.extension_pages ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("http");
  });

  it("pins the extension id", () => {
    // Without this the id is regenerated on reload and every allowlist that
    // names it silently stops matching.
    expect(manifest.key).toBeTruthy();
  });

  it("is not reachable from any web page", () => {
    expect(manifest.externally_connectable).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run --project unit extension/manifest.test.ts
```

Expected: **8 passed**, given Task 7's build already ran. If it fails on a missing file,
run the extension build first — the test asserts build output by design.

- [ ] **Step 3: Make the build a prerequisite of the test gate**

In the root `package.json`, change the `test` script so the manifest test can never pass
against a stale or absent build:

```json
"test": "pnpm --filter @passio/extension build && vitest run",
```

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.test.ts package.json
git commit -m "test(extension): assert the generated manifest's permission set"
```

---

### Task 9: Let the server talk to the extension

**Files:**
- Modify: `src/server/better-auth/config.ts`
- Modify: `src/app/api/trpc/[trpc]/route.ts`
- Modify: `src/app/api/auth/[...all]/route.ts`
- Create: `src/server/cors.ts`
- Create: `src/server/cors.test.ts`

- [ ] **Step 1: Write the failing test for the CORS helper**

`src/server/cors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { corsHeaders, EXTENSION_ORIGIN } from "./cors";

describe("corsHeaders", () => {
  it("allows the extension origin", () => {
    const h = corsHeaders(EXTENSION_ORIGIN);
    expect(h["Access-Control-Allow-Origin"]).toBe(EXTENSION_ORIGIN);
  });

  it("allows the Authorization header, or the bearer token never arrives", () => {
    const h = corsHeaders(EXTENSION_ORIGIN);
    expect(h["Access-Control-Allow-Headers"]).toContain("authorization");
  });

  it("returns nothing at all for an unknown origin", () => {
    // An echo of whatever Origin arrived would make this allow every site.
    expect(corsHeaders("https://evil.example")).toEqual({});
  });

  it("returns nothing for a null origin", () => {
    expect(corsHeaders(null)).toEqual({});
  });

  it("does not allow credentials, because the extension uses a bearer token", () => {
    const h = corsHeaders(EXTENSION_ORIGIN);
    expect(h["Access-Control-Allow-Credentials"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run --project unit src/server/cors.test.ts
```

Expected: FAIL — cannot resolve `./cors`.

- [ ] **Step 3: Implement `src/server/cors.ts`**

Substitute the real `EXT_ID` from `extension/.identity`.

```ts
/**
 * Cross-origin access for the browser extension, and nothing else.
 *
 * The allowlist is a single hard-coded origin rather than an echo of the request's
 * Origin header. Echoing is the standard way this goes wrong: it turns "allow my
 * extension" into "allow every website", which for an API that serves vault
 * ciphertext is not a small mistake.
 *
 * Credentials are deliberately NOT allowed. The extension authenticates with a
 * bearer token (spec D4), so cookies never need to cross this boundary - which
 * is what lets the web app keep SameSite=Lax on its session cookie.
 */
export const EXTENSION_ID = "PASTE_EXT_ID_FROM_extension/.identity";
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

export function corsHeaders(origin: string | null): Record<string, string> {
  if (origin !== EXTENSION_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": EXTENSION_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-trpc-source",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
```

- [ ] **Step 4: Run the test again**

```bash
pnpm vitest run --project unit src/server/cors.test.ts
```

Expected: **5 passed**.

- [ ] **Step 5: Apply the headers on both API routes**

`src/app/api/trpc/[trpc]/route.ts` — wrap the existing handler:

```ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { corsHeaders } from "~/server/cors";

const createContext = async (req: NextRequest) =>
  createTRPCContext({ headers: req.headers });

const handler = async (req: NextRequest) => {
  const cors = corsHeaders(req.headers.get("origin"));

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });

  for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
  return response;
};

/** Preflight. Without it the browser never sends the Authorization header. */
export function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export { handler as GET, handler as POST };
```

Apply the same `OPTIONS` export and response-header loop to
`src/app/api/auth/[...all]/route.ts`, preserving whatever that file already does.

- [ ] **Step 6: Trust the extension origin and issue bearer tokens**

In `src/server/better-auth/config.ts`, add the import and two config keys. Leave
everything else — especially the `databaseHooks` block — untouched:

```ts
import { bearer } from "better-auth/plugins";

import { EXTENSION_ORIGIN } from "~/server/cors";
```

```ts
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: resolveBaseURL(),

  /** The extension is a first-party client on its own origin. */
  trustedOrigins: [EXTENSION_ORIGIN],

  /** Issues a token in the `set-auth-token` response header, which the extension
   *  stores and replays as `Authorization: Bearer`. Cookies cannot cross into a
   *  chrome-extension:// origin without SameSite=None on the web app's session
   *  cookie, which would weaken CSRF posture on the site to serve the extension. */
  plugins: [bearer()],

  database: drizzleAdapter(db, { provider: "pg" }),
  // ... everything else unchanged
});
```

- [ ] **Step 7: Full gates**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke
```

Expected: **367 tests** (354 + 8 manifest + 5 cors), all five gates green.

- [ ] **Step 8: Commit and push**

```bash
git add -A src/server src/app/api extension
git commit -m "feat(api): let the extension origin authenticate with a bearer token"
git push origin main
vercel ls --scope hiplip | head -5
```

Expected: newest deployment **Ready**.

---

### Task 10: Extension auth and API client

**Files:**
- Create: `extension/src/auth.ts`, `extension/src/auth.test.ts`
- Create: `extension/src/api.ts`

- [ ] **Step 1: Write the failing test for token storage**

`extension/src/auth.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearToken, readToken, writeToken, type TokenStore } from "./auth";

function fakeStore(): TokenStore {
  let value: string | undefined;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (v: string) => { value = v; }),
    remove: vi.fn(async () => { value = undefined; }),
  };
}

describe("token storage", () => {
  let store: TokenStore;
  beforeEach(() => { store = fakeStore(); });

  it("round-trips a token", async () => {
    await writeToken(store, "abc123");
    expect(await readToken(store)).toBe("abc123");
  });

  it("returns null when nothing is stored", async () => {
    expect(await readToken(store)).toBeNull();
  });

  it("clears the token", async () => {
    await writeToken(store, "abc123");
    await clearToken(store);
    expect(await readToken(store)).toBeNull();
  });

  it("treats an empty string as absent", async () => {
    // A blank Authorization header reads as "signed in" and fails every call
    // with a confusing 401 rather than showing the sign-in screen.
    await writeToken(store, "");
    expect(await readToken(store)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run --project unit extension/src/auth.test.ts
```

Expected: FAIL — cannot resolve `./auth`.

- [ ] **Step 3: Implement `extension/src/auth.ts`**

```ts
import { performDerivation } from "@passio/crypto/worker/derive";
import type { WrappingKey } from "@passio/crypto/types";

const TOKEN_KEY = "passio.session-token";

/** The slice of chrome.storage.local this module uses. Narrow on purpose, so
 *  tests can supply a fake - nothing here can run in a real extension context. */
export interface TokenStore {
  get(): Promise<string | undefined>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

export const chromeTokenStore: TokenStore = {
  async get() {
    const r = await chrome.storage.local.get(TOKEN_KEY);
    return r[TOKEN_KEY] as string | undefined;
  },
  async set(value) {
    await chrome.storage.local.set({ [TOKEN_KEY]: value });
  },
  async remove() {
    await chrome.storage.local.remove(TOKEN_KEY);
  },
};

export async function readToken(store: TokenStore): Promise<string | null> {
  const v = await store.get();
  return v ? v : null; // an empty string is absent, not a token
}

export async function writeToken(store: TokenStore, token: string): Promise<void> {
  await store.set(token);
}

export async function clearToken(store: TokenStore): Promise<void> {
  await store.remove();
}

export interface SignInResult {
  token: string;
  /** Unwraps the vault key. Phase 2 discards it; Phase 3 keeps it. */
  stretchedKey: WrappingKey;
}

/**
 * Signs in with the derived auth hash, never the master password.
 *
 * One Argon2id pass produces both outputs: `authHash` proves identity to the
 * server, `stretchedKey` unwraps the vault key locally. The server never sees
 * anything it could unwrap a vault with.
 */
export async function signIn(
  apiBase: string,
  email: string,
  masterPassword: string,
): Promise<SignInResult> {
  const { authHash, stretchedKey } = await performDerivation(masterPassword, email);

  const res = await fetch(`${apiBase}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: authHash }),
  });

  if (!res.ok) {
    throw new Error(
      res.status === 401 ? "Wrong email or master password." : "Could not sign in.",
    );
  }

  const token = res.headers.get("set-auth-token");
  if (!token) throw new Error("Server did not return a session token.");

  return { token, stretchedKey };
}
```

- [ ] **Step 4: Run the test again**

```bash
pnpm vitest run --project unit extension/src/auth.test.ts
```

Expected: **4 passed**.

- [ ] **Step 5: Implement `extension/src/api.ts`**

```ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";

// Type-only: pulls the router's SHAPE across, never its code. A value import
// here would drag the database and Better Auth into the extension bundle.
import type { AppRouter } from "@web/server/api/root";

export const API_BASE = "https://passio-hiplip.vercel.app";

export function createApi(token: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_BASE}/api/trpc`,
        transformer: SuperJSON,
        headers: () => ({ authorization: `Bearer ${token}` }),
      }),
    ],
  });
}

export type Api = ReturnType<typeof createApi>;
```

- [ ] **Step 6: Prove the type-only import did not pull server code in**

```bash
pnpm --filter @passio/extension build
grep -rl "drizzle-orm\|better-auth\|postgres" extension/.output/chrome-mv3/ \
  && echo "LEAK: server code reached the bundle" && exit 1 \
  || echo "clean: no server code in the bundle"
```

Expected: `clean: no server code in the bundle`. A leak here means `import type` was
written as a value import somewhere — fix the import, do not add a bundler exclusion.

- [ ] **Step 7: Commit**

```bash
git add extension/src
git commit -m "feat(extension): sign in with a bearer token and a typed tRPC client"
```

---

### Task 11: Popup sign-in screen

**Files:**
- Modify: `extension/entrypoints/popup/main.tsx`
- Create: `extension/entrypoints/popup/styles.css`

- [ ] **Step 1: Build the screen**

This is mechanical UI with no branching logic worth a unit test — the behaviour it drives
(`signIn`, `readToken`) is already covered by Task 10. Keep it to one file.

`extension/entrypoints/popup/main.tsx`:

```tsx
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { API_BASE, createApi } from "../../src/api";
import { chromeTokenStore, readToken, signIn, writeToken } from "../../src/auth";
import "./styles.css";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; error?: string }
  | { kind: "connected"; email: string };

function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const token = await readToken(chromeTokenStore);
      if (!token) return setState({ kind: "signed-out" });
      try {
        // Phase 3 replaces this with a real unlock. For now it only proves the
        // token works across origins.
        await createApi(token).account.status.query();
        setState({ kind: "connected", email: "" });
      } catch {
        setState({ kind: "signed-out" });
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { token } = await signIn(API_BASE, email, password);
      await writeToken(chromeTokenStore, token);
      setState({ kind: "connected", email });
    } catch (err) {
      setState({
        kind: "signed-out",
        error: err instanceof Error ? err.message : "Could not sign in.",
      });
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  if (state.kind === "loading") return <main className="pad">Checking…</main>;

  if (state.kind === "connected") {
    return (
      <main className="pad">
        <h1>passio</h1>
        <p className="ok">Connected.</p>
        <p className="muted">Unlocking arrives in the next phase.</p>
      </main>
    );
  }

  return (
    <main className="pad">
      <h1>passio</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email" type="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Master password</label>
        <input
          id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {state.error ? <p className="error">{state.error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? "Deriving key…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
```

"Deriving key…" is the button's busy label because Argon2id at 64 MiB takes about a
second and a silent button reads as a broken one.

- [ ] **Step 2: Write `extension/entrypoints/popup/styles.css`**

Match the web app's calm palette; the popup is 360px wide and never scrolls horizontally.

```css
:root { color-scheme: light dark; --fg: #18181b; --muted: #71717a;
        --bg: #fafafa; --border: #e4e4e7; --accent: #18181b; --error: #b91c1c;
        --ok: #15803d; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #fafafa; --muted: #a1a1aa; --bg: #18181b;
          --border: #3f3f46; --accent: #fafafa; --error: #f87171; --ok: #4ade80; }
}
* { box-sizing: border-box; }
body { margin: 0; width: 360px; font: 14px/1.5 system-ui, sans-serif;
       color: var(--fg); background: var(--bg); }
.pad { padding: 16px; }
h1 { font-size: 15px; margin: 0 0 12px; letter-spacing: -0.01em; }
label { display: block; font-size: 12px; color: var(--muted); margin: 10px 0 4px; }
input { width: 100%; padding: 8px 10px; border: 1px solid var(--border);
        border-radius: 6px; background: transparent; color: var(--fg); font: inherit; }
button { width: 100%; margin-top: 14px; padding: 9px; border: 0; border-radius: 6px;
         background: var(--accent); color: var(--bg); font: inherit; font-weight: 500;
         cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
.muted { color: var(--muted); } .error { color: var(--error); } .ok { color: var(--ok); }
```

- [ ] **Step 3: Gates and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke
git add extension
git commit -m "feat(extension): add the sign-in screen"
git push origin main
```

**Phase 2 ends with a handoff.** The user loads
`extension/.output/chrome-mv3/` via `chrome://extensions` → Load unpacked, and confirms
sign-in reaches "Connected." Nothing on this machine can prove that.


---

# PHASE 3 — Offscreen custody, unlock, browse and copy

**Proves:** the load-bearing assumption — that an offscreen document survives service
worker eviction and keeps a non-extractable `CryptoKey` alive. Ships a usable
copy-from-popup product.

**Deploys:** no server change.

---

### Task 12: The message protocol

**Files:**
- Create: `extension/src/messages.ts`, `extension/src/messages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { parseRequest, type Request } from "./messages";

describe("parseRequest", () => {
  it("accepts a status request", () => {
    expect(parseRequest({ target: "offscreen", kind: "status" })).toEqual({
      target: "offscreen", kind: "status",
    });
  });

  it("accepts an unlock request", () => {
    const req: Request = {
      target: "offscreen", kind: "unlock",
      email: "a@b.co", password: "hunter2hunter2",
    };
    expect(parseRequest(req)).toEqual(req);
  });

  it("rejects an unknown kind", () => {
    expect(parseRequest({ target: "offscreen", kind: "exfiltrate" })).toBeNull();
  });

  it("rejects a message with no target", () => {
    expect(parseRequest({ kind: "status" })).toBeNull();
  });

  it("rejects a field name that is not one of the three", () => {
    // The fill path turns this into a value typed into a page. It is the last
    // place to accept "whatever the caller said".
    expect(parseRequest({
      target: "offscreen", kind: "fieldValue",
      itemId: "3f1e...", field: "notes",
    })).toBeNull();
  });

  it("rejects junk", () => {
    expect(parseRequest(null)).toBeNull();
    expect(parseRequest("status")).toBeNull();
    expect(parseRequest(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run --project unit extension/src/messages.test.ts
```

Expected: FAIL — cannot resolve `./messages`.

- [ ] **Step 3: Implement `extension/src/messages.ts`**

```ts
import { z } from "zod";

/**
 * Everything crossing an extension message boundary, validated on arrival.
 *
 * `target` exists because chrome.runtime.sendMessage broadcasts to every
 * extension context at once: without it the background worker and the offscreen
 * document both answer the same message and the first reply wins at random.
 */
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ target: z.literal("offscreen"), kind: z.literal("status") }),
  z.object({
    target: z.literal("offscreen"),
    kind: z.literal("unlock"),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  z.object({ target: z.literal("offscreen"), kind: z.literal("lock") }),
  z.object({ target: z.literal("offscreen"), kind: z.literal("items") }),
  z.object({
    target: z.literal("offscreen"),
    kind: z.literal("fieldValue"),
    itemId: z.string().uuid(),
    field: z.enum(["username", "password", "totp"]),
  }),
]);

export type Request = z.infer<typeof requestSchema>;

export type VaultState = "signed-out" | "locked" | "unlocked";

export interface ItemSummary {
  id: string;
  title: string;
  type: "login" | "note" | "card";
  username?: string;
  uri?: string;
  hasTotp: boolean;
}

export type Response =
  | { ok: true; kind: "status"; state: VaultState }
  | { ok: true; kind: "unlock" }
  | { ok: true; kind: "lock" }
  | { ok: true; kind: "items"; items: ItemSummary[]; damaged: number }
  | { ok: true; kind: "fieldValue"; value: string }
  | { ok: false; error: string };

export function parseRequest(value: unknown): Request | null {
  const parsed = requestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
```

Note `ItemSummary` carries **no secrets**: no password, no note body, no card number.
The popup renders a list from these and asks for a single value only when the person
actually clicks copy or fill. Shipping full plaintext to the popup on every open would
put the whole vault in a second context for no reason.

- [ ] **Step 4: Run the test again**

```bash
pnpm vitest run --project unit extension/src/messages.test.ts
```

Expected: **6 passed**.

- [ ] **Step 5: Commit**

```bash
git add extension/src/messages.ts extension/src/messages.test.ts
git commit -m "feat(extension): define the validated message protocol"
```

---

### Task 13: Key custody

The only stateful thing in the extension, and the reason the whole design exists. Every
dependency is injected so this file is fully testable with no browser and no network.

**Files:**
- Create: `extension/src/custody.ts`, `extension/src/custody.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encryptItem, generateVaultKey, itemAad, wrapVaultKey } from "@passio/crypto";
import type { WrappingKey } from "@passio/crypto/types";

import { createCustody, type CustodyDeps } from "./custody";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

/** A real AES-GCM key standing in for a derived one. The point of these tests is
 *  the custody state machine, not the KDF, which packages/crypto already covers. */
async function fakeWrappingKey(): Promise<WrappingKey> {
  return (await webcrypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  )) as WrappingKey;
}

async function fixture() {
  const wrappingKey = await fakeWrappingKey();
  const vaultKey = await generateVaultKey();
  const protectedVaultKey = await wrapVaultKey(vaultKey, wrappingKey, "master");

  const ciphertext = await encryptItem(
    { type: "login", title: "GitHub", username: "ada", password: "s3cret",
      uri: "https://github.com/login" },
    vaultKey, itemAad(ITEM_ID),
  );

  return { wrappingKey, protectedVaultKey, ciphertext };
}

function deps(over: Partial<CustodyDeps>, f: Awaited<ReturnType<typeof fixture>>): CustodyDeps {
  let stored: string | null = null;
  return {
    derive: vi.fn(async () => ({ authHash: "AUTH", stretchedKey: f.wrappingKey })),
    signIn: vi.fn(async () => "TOKEN"),
    readToken: vi.fn(async () => stored),
    writeToken: vi.fn(async (t: string) => { stored = t; }),
    clearToken: vi.fn(async () => { stored = null; }),
    api: vi.fn(() => ({
      getKeys: async () => ({ protectedVaultKey: f.protectedVaultKey }),
      listItems: async () => [{
        id: ITEM_ID, ciphertext: f.ciphertext,
        createdAt: new Date(), updatedAt: new Date(),
      }],
    })),
    ...over,
  };
}

describe("custody", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });

  it("starts signed out when there is no token", async () => {
    const c = createCustody(deps({}, f));
    expect(await c.status()).toBe("signed-out");
  });

  it("reports locked when a token exists but no key is held", async () => {
    const c = createCustody(deps({ readToken: async () => "TOKEN" }, f));
    expect(await c.status()).toBe("locked");
  });

  it("unlocks and reports unlocked", async () => {
    const c = createCustody(deps({}, f));
    await c.unlock("a@b.co", "master");
    expect(await c.status()).toBe("unlocked");
  });

  it("signs in when there is no token, and stores it", async () => {
    const d = deps({}, f);
    const c = createCustody(d);
    await c.unlock("a@b.co", "master");
    expect(d.signIn).toHaveBeenCalledOnce();
    expect(d.writeToken).toHaveBeenCalledWith("TOKEN");
  });

  it("skips sign-in when a token already works", async () => {
    const d = deps({ readToken: async () => "EXISTING" }, f);
    const c = createCustody(d);
    await c.unlock("a@b.co", "master");
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("re-signs-in once when the stored token is rejected", async () => {
    let calls = 0;
    const d = deps({
      readToken: async () => "STALE",
      api: () => ({
        getKeys: async () => {
          calls += 1;
          if (calls === 1) throw new Error("UNAUTHORIZED");
          return { protectedVaultKey: f.protectedVaultKey };
        },
        listItems: async () => [],
      }),
    }, f);
    const c = createCustody(d);
    await c.unlock("a@b.co", "master");
    expect(d.signIn).toHaveBeenCalledOnce();
    expect(await c.status()).toBe("unlocked");
  });

  it("returns item summaries that carry no secrets", async () => {
    const c = createCustody(deps({}, f));
    await c.unlock("a@b.co", "master");
    const { items } = await c.items();

    expect(items).toEqual([{
      id: ITEM_ID, title: "GitHub", type: "login",
      username: "ada", uri: "https://github.com/login", hasTotp: false,
    }]);
    // The whole point: no password anywhere in what the popup receives.
    expect(JSON.stringify(items)).not.toContain("s3cret");
  });

  it("hands over a single field only when asked", async () => {
    const c = createCustody(deps({}, f));
    await c.unlock("a@b.co", "master");
    expect(await c.fieldValue(ITEM_ID, "password")).toBe("s3cret");
    expect(await c.fieldValue(ITEM_ID, "username")).toBe("ada");
  });

  it("refuses every operation while locked", async () => {
    const c = createCustody(deps({}, f));
    await expect(c.items()).rejects.toThrow(/locked/i);
    await expect(c.fieldValue(ITEM_ID, "password")).rejects.toThrow(/locked/i);
  });

  it("forgets the key on lock", async () => {
    const c = createCustody(deps({}, f));
    await c.unlock("a@b.co", "master");
    c.lock();
    expect(await c.status()).toBe("locked");
    await expect(c.items()).rejects.toThrow(/locked/i);
  });

  it("keeps the session token when locking", async () => {
    // Locking is not signing out. Clearing the token here would mean typing the
    // email again after every idle timeout.
    const d = deps({}, f);
    const c = createCustody(d);
    await c.unlock("a@b.co", "master");
    c.lock();
    expect(d.clearToken).not.toHaveBeenCalled();
  });

  it("does not hold a key after a failed unlock", async () => {
    const c = createCustody(deps({
      derive: async () => ({ authHash: "AUTH", stretchedKey: await fakeWrappingKey() }),
    }, f));
    await expect(c.unlock("a@b.co", "wrong")).rejects.toThrow();
    expect(await c.status()).toBe("locked");
  });

  it("returns an empty field rather than throwing when the field is absent", async () => {
    const c = createCustody(deps({}, f));
    await c.unlock("a@b.co", "master");
    expect(await c.fieldValue(ITEM_ID, "totp")).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run --project unit extension/src/custody.test.ts
```

Expected: FAIL — cannot resolve `./custody`.

- [ ] **Step 3: Implement `extension/src/custody.ts`**

```ts
import { unwrapVaultKey, type VaultKey } from "@passio/crypto";
import type { WrappingKey } from "@passio/crypto/types";
import { copyActionsFor } from "@passio/core/actions";
import { decryptVault, type EncryptedRow } from "@passio/core/decrypt-vault";

import type { ItemSummary, VaultState } from "./messages";

export interface CustodyApi {
  getKeys(): Promise<{ protectedVaultKey: string }>;
  listItems(): Promise<EncryptedRow[]>;
}

export interface CustodyDeps {
  derive(email: string, masterPassword: string): Promise<{
    authHash: string;
    stretchedKey: WrappingKey;
  }>;
  signIn(email: string, authHash: string): Promise<string>;
  readToken(): Promise<string | null>;
  writeToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  api(token: string): CustodyApi;
}

/**
 * The vault key's only home.
 *
 * This closure runs in the offscreen document and nowhere else. The key is a
 * non-extractable CryptoKey in a local variable: it is never serialised, never
 * written to storage, and never sent in a message. Callers get item summaries
 * without secrets, or one named field at a time.
 *
 * Everything it needs is injected, so the whole state machine is testable
 * without a browser - which matters here more than usual, because no test on the
 * build machine can exercise the real thing.
 */
export function createCustody(deps: CustodyDeps) {
  let vaultKey: VaultKey | null = null;

  async function authorisedApi(email: string, authHash: string): Promise<CustodyApi> {
    const existing = await deps.readToken();

    if (existing) {
      const api = deps.api(existing);
      try {
        await api.getKeys();
        return api;
      } catch {
        // A stored token expires eventually. We already hold the auth hash from
        // this unlock's derivation, so sign in again rather than making the
        // person retype anything. Exactly one retry: a second failure is a real
        // error, not a stale token.
        await deps.clearToken();
      }
    }

    const token = await deps.signIn(email, authHash);
    await deps.writeToken(token);
    return deps.api(token);
  }

  function requireKey(): VaultKey {
    if (!vaultKey) throw new Error("The vault is locked.");
    return vaultKey;
  }

  return {
    async status(): Promise<VaultState> {
      if (vaultKey) return "unlocked";
      return (await deps.readToken()) ? "locked" : "signed-out";
    },

    /** One Argon2id pass yields both the auth hash and the wrapping key. */
    async unlock(email: string, masterPassword: string): Promise<void> {
      const { authHash, stretchedKey } = await deps.derive(email, masterPassword);
      const api = await authorisedApi(email, authHash);
      const { protectedVaultKey } = await api.getKeys();

      // Throws on a wrong master password: the AES-GCM tag fails to verify.
      // vaultKey is only assigned after a success, so a failed unlock leaves
      // the vault locked rather than half-open.
      vaultKey = await unwrapVaultKey(protectedVaultKey, stretchedKey, "master");
    },

    /** Forgets the key. Deliberately keeps the session token: locking is not
     *  signing out, and clearing it would mean retyping the email every time. */
    lock(): void {
      vaultKey = null;
    },

    async signOut(): Promise<void> {
      vaultKey = null;
      await deps.clearToken();
    },

    async items(): Promise<{ items: ItemSummary[]; damaged: number }> {
      const key = requireKey();
      const token = await deps.readToken();
      if (!token) throw new Error("The vault is locked.");

      const rows = await deps.api(token).listItems();
      const { items, damaged } = await decryptVault(rows, key);

      return {
        damaged: damaged.length,
        items: items.map(({ id, data }): ItemSummary => ({
          id,
          title: data.title,
          type: data.type,
          username: data.type === "login" ? data.username : undefined,
          uri: data.type === "login" ? data.uri : undefined,
          hasTotp: data.type === "login" && data.totp !== undefined,
        })),
      };
    },

    /**
     * One field, decrypted on demand.
     *
     * Routed through copyActionsFor so the one-time code is generated at call
     * time rather than when the list was built - a code from the previous window
     * is worse than no code, because it looks like it worked.
     */
    async fieldValue(
      itemId: string,
      field: "username" | "password" | "totp",
    ): Promise<string> {
      const key = requireKey();
      const token = await deps.readToken();
      if (!token) throw new Error("The vault is locked.");

      const rows = await deps.api(token).listItems();
      const { items } = await decryptVault(rows, key);
      const found = items.find((i) => i.id === itemId);
      if (!found) throw new Error("That item is no longer in the vault.");

      return copyActionsFor(found.data).find((a) => a.key === field)?.value ?? "";
    },
  };
}

export type Custody = ReturnType<typeof createCustody>;
```

- [ ] **Step 4: Run the test again**

```bash
pnpm vitest run --project unit extension/src/custody.test.ts
```

Expected: **13 passed**.

- [ ] **Step 5: Commit**

```bash
git add extension/src/custody.ts extension/src/custody.test.ts
git commit -m "feat(extension): hold the vault key in an injectable custody module"
```

---

### Task 14: The offscreen document

**Files:**
- Create: `extension/entrypoints/offscreen/index.html`
- Create: `extension/entrypoints/offscreen/main.ts`

- [ ] **Step 1: `extension/entrypoints/offscreen/index.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>passio</title></head>
  <body>
    <!-- Never rendered. This document exists only to own a JS heap that MV3
         will not evict, and the vault key lives in it. -->
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: `extension/entrypoints/offscreen/main.ts`**

```ts
import { deriveInWorker } from "@passio/crypto/worker/client";

import { API_BASE, createApi } from "../../src/api";
import { chromeTokenStore, clearToken, readToken, writeToken } from "../../src/auth";
import { createCustody } from "../../src/custody";
import { parseRequest, type Response } from "../../src/messages";

const custody = createCustody({
  derive: (email, masterPassword) => deriveInWorker(masterPassword, email),

  async signIn(email, authHash) {
    const res = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: authHash }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 401 ? "Wrong email or master password." : "Could not sign in.",
      );
    }
    const token = res.headers.get("set-auth-token");
    if (!token) throw new Error("Server did not return a session token.");
    return token;
  },

  readToken: () => readToken(chromeTokenStore),
  writeToken: (t) => writeToken(chromeTokenStore, t),
  clearToken: () => clearToken(chromeTokenStore),

  api: (token) => {
    const api = createApi(token);
    return {
      getKeys: () => api.vault.getKeys.query(),
      listItems: () => api.item.list.query(),
    };
  },
});

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  // Only our own extension, and only messages addressed here. The background
  // worker shares this broadcast channel.
  if (sender.id !== chrome.runtime.id) return false;
  const req = parseRequest(raw);
  if (!req) return false;

  void (async (): Promise<Response> => {
    switch (req.kind) {
      case "status":
        return { ok: true, kind: "status", state: await custody.status() };
      case "unlock":
        await custody.unlock(req.email, req.password);
        return { ok: true, kind: "unlock" };
      case "lock":
        custody.lock();
        return { ok: true, kind: "lock" };
      case "items":
        return { ok: true, kind: "items", ...(await custody.items()) };
      case "fieldValue":
        return {
          ok: true, kind: "fieldValue",
          value: await custody.fieldValue(req.itemId, req.field),
        };
    }
  })()
    .then(sendResponse)
    .catch((e: unknown) =>
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : "Something went wrong.",
      } satisfies Response),
    );

  return true; // keeps the message channel open for the async reply
});
```

- [ ] **Step 3: Commit**

```bash
git add extension/entrypoints/offscreen
git commit -m "feat(extension): add the offscreen document that owns the vault key"
```

---

### Task 15: The background router

**Files:**
- Modify: `extension/entrypoints/background.ts`

- [ ] **Step 1: Implement**

```ts
import type { Request, Response } from "../src/messages";

const OFFSCREEN_PATH = "offscreen.html";
const LOCK_ALARM = "passio.auto-lock";
const DEFAULT_LOCK_MINUTES = 15;

/**
 * Ensures the one document that holds the vault key exists.
 *
 * Chrome allows exactly one offscreen document per extension, and creating a
 * second throws. Two concurrent popup opens race here, so the in-flight promise
 * is shared rather than the check being repeated.
 */
let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
  });
  if (existing.length > 0) return;

  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS" as chrome.offscreen.Reason],
      justification:
        "Runs Argon2id in a Web Worker and holds the vault key in memory, " +
        "which the service worker cannot do because MV3 evicts it.",
    })
    .finally(() => { creating = null; });

  await creating;
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;

    const req = raw as Partial<Request>;
    if (req?.target !== "offscreen") return false;

    void (async () => {
      await ensureOffscreen();
      const res: Response = await chrome.runtime.sendMessage(raw);

      // Any successful interaction is activity: push the idle deadline out.
      if (res.ok && req.kind !== "status") await resetLockAlarm();
      if (res.ok && req.kind === "lock") await chrome.alarms.clear(LOCK_ALARM);

      sendResponse(res);
    })().catch(() =>
      // A missing offscreen document lands here. The popup reads a failure as
      // "locked" and shows unlock, which is the correct degradation.
      sendResponse({ ok: false, error: "The vault is locked." } satisfies Response),
    );

    return true;
  });

  /** chrome.alarms outlives service-worker eviction, which setTimeout does not.
   *  That is the whole reason auto-lock is here and not in the offscreen doc. */
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== LOCK_ALARM) return;
    void chrome.runtime.sendMessage({ target: "offscreen", kind: "lock" });
  });
});

async function resetLockAlarm(): Promise<void> {
  await chrome.alarms.clear(LOCK_ALARM);
  chrome.alarms.create(LOCK_ALARM, { delayInMinutes: DEFAULT_LOCK_MINUTES });
}
```

The fixed 15 minutes is deliberate for this phase. Phase 6 makes it configurable; no
phase ever leaves the key alive indefinitely.

- [ ] **Step 2: Commit**

```bash
git add extension/entrypoints/background.ts
git commit -m "feat(extension): route messages and hold the auto-lock alarm"
```

---

### Task 16: Popup unlock, list, search and copy

**Files:**
- Create: `extension/src/client.ts`
- Modify: `extension/entrypoints/popup/main.tsx`, `extension/entrypoints/popup/styles.css`

- [ ] **Step 1: A typed wrapper so the popup never hand-builds a message**

`extension/src/client.ts`:

```ts
import type { ItemSummary, Request, Response, VaultState } from "./messages";

async function send(req: Request): Promise<Response> {
  try {
    return (await chrome.runtime.sendMessage(req)) as Response;
  } catch {
    // No receiver: the offscreen document is gone. Degrade to locked.
    return { ok: false, error: "The vault is locked." };
  }
}

function unwrap<T extends Response["kind"]>(res: Response, kind: T) {
  if (!res.ok) throw new Error(res.error);
  if (res.kind !== kind) throw new Error("Unexpected reply from the vault.");
  return res;
}

export const vault = {
  async status(): Promise<VaultState> {
    const res = await send({ target: "offscreen", kind: "status" });
    return res.ok && res.kind === "status" ? res.state : "locked";
  },
  async unlock(email: string, password: string): Promise<void> {
    unwrap(await send({ target: "offscreen", kind: "unlock", email, password }), "unlock");
  },
  async lock(): Promise<void> {
    await send({ target: "offscreen", kind: "lock" });
  },
  async items(): Promise<{ items: ItemSummary[]; damaged: number }> {
    const res = unwrap(await send({ target: "offscreen", kind: "items" }), "items");
    return { items: res.items, damaged: res.damaged };
  },
  async fieldValue(
    itemId: string, field: "username" | "password" | "totp",
  ): Promise<string> {
    const res = unwrap(
      await send({ target: "offscreen", kind: "fieldValue", itemId, field }), "fieldValue",
    );
    return res.value;
  },
};
```

- [ ] **Step 2: Rebuild the popup**

Three states: signed-out (the Phase 2 form), locked (master password only), unlocked
(search + list + copy). Reuse `@passio/core/search` for filtering so the extension and
the web app rank results identically, and `@passio/core/clipboard` for the 30-second
auto-clear.

The list renders `ItemSummary` only. A copy button calls `vault.fieldValue` for that one
field at that moment, then `copyWithAutoClear`. No secret is in the popup's memory before
the click, and none stays after the clear.

Key points the implementation must honour:

- The unlock form asks for the master password only — the email comes from the stored
  session. Asking for both again on every idle timeout is the difference between a
  15-minute lock being usable and being switched off.
- Argon2id takes about a second: the submit button reads "Unlocking…" and is disabled.
- `damaged > 0` renders a warning line naming the count. A vault silently missing items
  is the worst failure mode a password manager has.
- After copying, show which field was copied and that the clipboard clears in 30 seconds.

- [ ] **Step 3: Gates**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke
```

Expected: **386 tests** (367 + 6 messages + 13 custody), all green.

- [ ] **Step 4: Commit and push**

```bash
git add extension
git commit -m "feat(extension): unlock the vault and browse it from the popup"
git push origin main
```

**Phase 3 ends with the most important handoff in the plan.** The user must confirm, in
real Chrome, that the vault stays unlocked after the service worker is evicted. The
procedure is in the handoff checklist at the end of this document.

---

# PHASE 4 — Site matching and the badge

**Proves:** the right items surface for the current site without searching.

---

### Task 17: `matchItemsToUrl`

**Files:**
- Create: `packages/core/src/match.ts`, `packages/core/src/match.test.ts`
- Modify: `packages/core/package.json` (add `tldts`)

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @passio/core add tldts
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { matchItemsToUrl, type MatchableItem } from "./match";

const item = (id: string, uri?: string): MatchableItem => ({ id, uri });

describe("matchItemsToUrl", () => {
  it("matches an exact host", () => {
    const items = [item("a", "https://github.com/login")];
    expect(matchItemsToUrl(items, "https://github.com/settings").map((i) => i.id))
      .toEqual(["a"]);
  });

  it("matches across subdomains of the same registrable domain", () => {
    const items = [item("a", "https://accounts.google.com/signin")];
    expect(matchItemsToUrl(items, "https://mail.google.com/").map((i) => i.id))
      .toEqual(["a"]);
  });

  it("ranks an exact host above a base-domain match", () => {
    const items = [
      item("base", "https://google.com/"),
      item("exact", "https://mail.google.com/"),
    ];
    expect(matchItemsToUrl(items, "https://mail.google.com/").map((i) => i.id))
      .toEqual(["exact", "base"]);
  });

  it("keeps user-controlled subdomains apart", () => {
    // github.io is itself a public suffix, so alice and bob are different sites.
    // A naive last-two-labels rule would offer alice's login on bob's page.
    const items = [item("alice", "https://alice.github.io/app")];
    expect(matchItemsToUrl(items, "https://bob.github.io/app")).toEqual([]);
  });

  it("keeps vercel.app subdomains apart", () => {
    const items = [item("mine", "https://passio-hiplip.vercel.app/login")];
    expect(matchItemsToUrl(items, "https://someone-else.vercel.app/")).toEqual([]);
  });

  it("handles multi-part suffixes", () => {
    const items = [item("a", "https://www.bbc.co.uk/login")];
    expect(matchItemsToUrl(items, "https://news.bbc.co.uk/").map((i) => i.id))
      .toEqual(["a"]);
    expect(matchItemsToUrl(items, "https://other.co.uk/")).toEqual([]);
  });

  it("ignores items with no uri", () => {
    expect(matchItemsToUrl([item("a")], "https://github.com/")).toEqual([]);
  });

  it("refuses non-http schemes on either side", () => {
    // launchUrlFor already refuses these; a stored javascript: URI must not
    // become a match here either.
    expect(matchItemsToUrl([item("a", "javascript:alert(1)")], "https://x.com/"))
      .toEqual([]);
    expect(matchItemsToUrl([item("a", "https://x.com/")], "chrome://extensions"))
      .toEqual([]);
    expect(matchItemsToUrl([item("a", "https://x.com/")], "file:///tmp/x.html"))
      .toEqual([]);
  });

  it("tolerates a stored uri with no scheme", () => {
    // People type "github.com" into the URI field constantly.
    expect(matchItemsToUrl([item("a", "github.com")], "https://github.com/").map((i) => i.id))
      .toEqual(["a"]);
  });

  it("returns nothing for junk input rather than throwing", () => {
    expect(matchItemsToUrl([item("a", "https://x.com/")], "not a url")).toEqual([]);
    expect(matchItemsToUrl([item("a", ":::")], "https://x.com/")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm vitest run --project unit packages/core/src/match.test.ts
```

Expected: FAIL — cannot resolve `./match`.

- [ ] **Step 4: Implement `packages/core/src/match.ts`**

```ts
import { parse } from "tldts";

export interface MatchableItem {
  id: string;
  uri?: string;
}

/** http(s) only. A stored `javascript:` URI is a stored XSS payload, and this is
 *  one of the two places that decides whether it ever gets used. */
function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    // A bare "github.com" is what people actually type into a URI field.
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The registrable domain, via the public suffix list.
 *
 * The PSL is the point. "Last two labels" makes alice.github.io and
 * bob.github.io the same site, so one person's login gets offered on a page the
 * other controls. The list knows github.io - and vercel.app, which this project
 * deploys to - are suffixes in their own right.
 */
function registrable(host: string): string | null {
  return parse(host).domain;
}

/**
 * Vault items that belong to a page, best match first.
 *
 * Exact host beats registrable domain, so a login saved for mail.google.com is
 * offered ahead of one saved for google.com when you are on mail.
 */
export function matchItemsToUrl<T extends MatchableItem>(items: T[], pageUrl: string): T[] {
  const page = toUrl(pageUrl);
  if (!page) return [];

  const pageDomain = registrable(page.hostname);
  const scored: Array<{ item: T; rank: number }> = [];

  for (const item of items) {
    if (!item.uri) continue;
    const url = toUrl(item.uri);
    if (!url) continue;

    if (url.hostname === page.hostname) {
      scored.push({ item, rank: 0 });
      continue;
    }

    const itemDomain = registrable(url.hostname);
    if (itemDomain && pageDomain && itemDomain === pageDomain) {
      scored.push({ item, rank: 1 });
    }
  }

  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.item);
}
```

- [ ] **Step 5: Run the test again**

```bash
pnpm vitest run --project unit packages/core/src/match.test.ts
```

Expected: **10 passed**.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): match vault items to a page by registrable domain"
```

---

### Task 18: Badge and the "this site" section

**Files:**
- Modify: `extension/src/messages.ts` (add a `matchCount` request)
- Modify: `extension/entrypoints/background.ts`
- Modify: `extension/entrypoints/popup/main.tsx`

- [ ] **Step 1: Extend the protocol**

Add to `requestSchema`:

```ts
  z.object({
    target: z.literal("offscreen"),
    kind: z.literal("matchCount"),
    url: z.string(),
  }),
```

and to `Response`:

```ts
  | { ok: true; kind: "matchCount"; count: number }
```

Add a matching test case to `messages.test.ts` asserting a `matchCount` request parses
and that one without a `url` does not.

- [ ] **Step 2: Handle it in custody**

Add to `createCustody`'s returned object, reusing the existing decrypt path:

```ts
    /** How many saved logins belong to a page. Returns 0 rather than throwing
     *  when locked: the badge must never be a lock-state oracle for the page. */
    async matchCount(url: string): Promise<number> {
      if (!vaultKey) return 0;
      const { items } = await this.items();
      return matchItemsToUrl(items, url).length;
    },
```

Import `matchItemsToUrl` from `@passio/core/match`. Add a custody test asserting it
returns 0 while locked and the right count while unlocked.

- [ ] **Step 3: Drive the badge from the background worker**

```ts
  async function updateBadge(tabId: number, url: string | undefined): Promise<void> {
    if (!url) return;
    let count = 0;
    try {
      await ensureOffscreen();
      const res: Response = await chrome.runtime.sendMessage({
        target: "offscreen", kind: "matchCount", url,
      });
      if (res.ok && res.kind === "matchCount") count = res.count;
    } catch {
      count = 0; // locked, or no offscreen document
    }
    await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#18181b" });
  }

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs.get(tabId).then((t) => updateBadge(tabId, t.url));
  });

  chrome.tabs.onUpdated.addListener((tabId, changed, tab) => {
    if (changed.status === "complete") void updateBadge(tabId, tab.url);
  });
```

- [ ] **Step 4: Popup shows matches first**

When unlocked, query the active tab, run `matchItemsToUrl` over the loaded summaries, and
render a "For this site" group above "All items". When nothing matches, render only
"All items" — an empty labelled group is noise.

- [ ] **Step 5: Gates and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke
git add -A packages extension
git commit -m "feat(extension): surface matching logins with a badge and a site group"
git push origin main
```

---

# PHASE 5 — Autofill

**Proves:** the goal.

---

### Task 19: `findLoginFields`

**Files:**
- Create: `extension/src/fields.ts`, `extension/src/fields.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { findLoginFields } from "./fields";

function dom(html: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  doc.body.innerHTML = html;
  // jsdom reports every element as zero-sized, so the visibility check would
  // reject everything. Give real inputs a box; anything the test wants hidden
  // keeps the default of none.
  for (const el of doc.querySelectorAll("input:not([data-invisible])")) {
    el.getBoundingClientRect = () => ({ width: 200, height: 32 }) as DOMRect;
  }
  return doc;
}

describe("findLoginFields", () => {
  it("finds a plain username and password form", () => {
    const doc = dom(`
      <form>
        <input name="username" type="text" />
        <input name="password" type="password" />
        <button>Sign in</button>
      </form>`);
    const f = findLoginFields(doc);
    expect(f.username?.getAttribute("name")).toBe("username");
    expect(f.password?.getAttribute("name")).toBe("password");
  });

  it("finds an email and password form", () => {
    const doc = dom(`
      <form><input type="email" id="email" /><input type="password" id="pw" /></form>`);
    expect(findLoginFields(doc).username?.id).toBe("email");
  });

  it("works when the fields are not inside a form", () => {
    const doc = dom(`
      <div><input type="text" id="u" /><input type="password" id="p" /></div>`);
    const f = findLoginFields(doc);
    expect(f.username?.id).toBe("u");
    expect(f.password?.id).toBe("p");
  });

  it("prefers autocomplete=username over an earlier text input", () => {
    const doc = dom(`
      <form>
        <input type="text" id="search" />
        <input type="text" id="user" autocomplete="username" />
        <input type="password" id="pw" />
      </form>`);
    expect(findLoginFields(doc).username?.id).toBe("user");
  });

  it("refuses a form with two password fields", () => {
    // Registration or change-password. Guessing here is user-hostile, so the
    // popup falls back to copy instead.
    const doc = dom(`
      <form>
        <input type="text" id="u" />
        <input type="password" id="new" />
        <input type="password" id="confirm" />
      </form>`);
    expect(findLoginFields(doc).password).toBeNull();
  });

  it("refuses a page with no password field", () => {
    const doc = dom(`<form><input type="text" id="q" /></form>`);
    expect(findLoginFields(doc).password).toBeNull();
  });

  it("never returns a hidden password field", () => {
    const doc = dom(`
      <form><input type="password" id="honeypot" data-invisible /></form>`);
    expect(findLoginFields(doc).password).toBeNull();
  });

  it("never returns a hidden username field", () => {
    // A page that plants an off-screen input to harvest autofill is a documented
    // attack, not a hypothetical.
    const doc = dom(`
      <form>
        <input type="text" id="trap" data-invisible />
        <input type="password" id="pw" />
      </form>`);
    const f = findLoginFields(doc);
    expect(f.password?.id).toBe("pw");
    expect(f.username).toBeNull();
  });

  it("skips disabled and readonly inputs", () => {
    const doc = dom(`
      <form>
        <input type="text" id="u1" disabled />
        <input type="text" id="u2" readonly />
        <input type="text" id="u3" />
        <input type="password" id="pw" />
      </form>`);
    expect(findLoginFields(doc).username?.id).toBe("u3");
  });

  it("ignores type=hidden", () => {
    const doc = dom(`
      <form>
        <input type="hidden" name="csrf" />
        <input type="text" id="u" />
        <input type="password" id="pw" />
      </form>`);
    expect(findLoginFields(doc).username?.id).toBe("u");
  });

  it("finds a one-time-code field", () => {
    const doc = dom(`<form><input id="otp" autocomplete="one-time-code" /></form>`);
    expect(findLoginFields(doc).totp?.id).toBe("otp");
  });

  it("finds a one-time-code field by name", () => {
    const doc = dom(`<form><input id="c" name="totp_code" /></form>`);
    expect(findLoginFields(doc).totp?.id).toBe("c");
  });

  it("returns nulls for a page with no inputs at all", () => {
    expect(findLoginFields(dom(`<p>nothing here</p>`)))
      .toEqual({ username: null, password: null, totp: null });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run --project unit extension/src/fields.test.ts
```

Expected: FAIL — cannot resolve `./fields`.

- [ ] **Step 3: Implement `extension/src/fields.ts`**

```ts
export interface LoginFields {
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
  totp: HTMLInputElement | null;
}

const USERNAME_HINT = /user|email|login|account/i;
const TOTP_HINT = /otp|totp|2fa|twofactor|one-?time/i;

/**
 * Never fill something the person cannot see.
 *
 * Pages that plant an off-screen input to harvest autofill are a documented
 * attack on password managers. Everything here is a reason to skip a field, and
 * the default when unsure is to skip.
 */
function visible(el: HTMLInputElement): boolean {
  if (el.type === "hidden" || el.disabled || el.readOnly) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function hints(el: HTMLInputElement): string {
  return `${el.name} ${el.id} ${el.getAttribute("autocomplete") ?? ""} ${el.placeholder}`;
}

/**
 * The username, password and one-time-code fields of a login form.
 *
 * Pure over a Document so it can be tested in jsdom - which matters more than
 * usual here, because there is no browser on the build machine and this is the
 * only part of the extension that touches a page the user did not write.
 */
export function findLoginFields(doc: Document): LoginFields {
  const inputs = [...doc.querySelectorAll("input")].filter(visible);

  const passwords = inputs.filter((el) => el.type === "password");

  // Exactly one, or none. Zero means this is not a login form; two or more means
  // registration or change-password, where a wrong guess is user-hostile. The
  // popup falls back to copy, which costs one paste.
  const password = passwords.length === 1 ? passwords[0]! : null;

  let username: HTMLInputElement | null = null;
  if (password) {
    const before = inputs.slice(0, inputs.indexOf(password));
    const candidates = before.filter(
      (el) => el.type === "text" || el.type === "email",
    );
    username =
      candidates.findLast((el) => el.autocomplete === "username") ??
      candidates.findLast((el) => el.type === "email") ??
      candidates.findLast((el) => USERNAME_HINT.test(hints(el))) ??
      candidates.at(-1) ??
      null;
  }

  const totp =
    inputs.find((el) => el.autocomplete === "one-time-code") ??
    inputs.find((el) => el.type !== "password" && TOTP_HINT.test(hints(el))) ??
    null;

  return { username, password, totp };
}
```

- [ ] **Step 4: Run the test again**

```bash
pnpm vitest run --project unit extension/src/fields.test.ts
```

Expected: **13 passed**.

- [ ] **Step 5: Commit**

```bash
git add extension/src/fields.ts extension/src/fields.test.ts
git commit -m "feat(extension): detect login fields without ever choosing a hidden one"
```

---

### Task 20: `fillField`

**Files:**
- Create: `extension/src/fill.ts`, `extension/src/fill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fillField } from "./fill";

describe("fillField", () => {
  it("sets the value", () => {
    const el = document.createElement("input");
    fillField(el, "hunter2");
    expect(el.value).toBe("hunter2");
  });

  it("dispatches input and change, both bubbling", () => {
    const el = document.createElement("input");
    document.body.append(el);
    const seen: Array<[string, boolean]> = [];
    for (const type of ["input", "change"]) {
      el.addEventListener(type, (e) => seen.push([e.type, e.bubbles]));
    }
    fillField(el, "x");
    expect(seen).toEqual([["input", true], ["change", true]]);
  });

  it("goes through the native setter so React sees the change", () => {
    // React installs its own `value` setter on the element to track changes.
    // Assigning el.value directly runs React's setter, which marks the value as
    // already-seen and makes React overwrite it on the next render. Writing
    // through the prototype's setter is what makes the fill stick.
    const el = document.createElement("input");
    const native = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, "value",
    )!.set!;
    const spy = vi.fn(native);
    Object.defineProperty(el, "value", {
      configurable: true,
      get: () => "",
      set: () => { throw new Error("the element's own setter must not be used"); },
    });
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      configurable: true, get() { return ""; }, set: spy,
    });

    expect(() => fillField(el, "v")).not.toThrow();
    expect(spy).toHaveBeenCalledWith("v");

    Object.defineProperty(HTMLInputElement.prototype, "value", {
      configurable: true, get() { return ""; }, set: native,
    });
  });

  it("focuses the field so frameworks that track focus behave", () => {
    const el = document.createElement("input");
    document.body.append(el);
    fillField(el, "x");
    expect(document.activeElement).toBe(el);
  });

  it("does nothing to a null element", () => {
    expect(() => fillField(null, "x")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run --project unit extension/src/fill.test.ts
```

Expected: FAIL — cannot resolve `./fill`.

- [ ] **Step 3: Implement `extension/src/fill.ts`**

```ts
/**
 * Puts a value into an input so that React and friends actually notice.
 *
 * `el.value = x` does not work on a React-controlled input: React installs its
 * own setter to track the value, so a direct assignment is recorded as
 * already-seen and overwritten on the next render. Writing through the
 * prototype's native setter bypasses that tracker, and the events below then
 * tell the framework something changed.
 *
 * Half the web is React. This is not an edge case.
 */
export function fillField(el: HTMLInputElement | null, value: string): void {
  if (!el) return;

  el.focus();

  const native = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value",
  )?.set;
  if (native) native.call(el, value);
  else el.value = value;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
```

- [ ] **Step 4: Run the test again**

```bash
pnpm vitest run --project unit extension/src/fill.test.ts
```

Expected: **5 passed**.

- [ ] **Step 5: Commit**

```bash
git add extension/src/fill.ts extension/src/fill.test.ts
git commit -m "feat(extension): fill inputs through the native setter"
```

---

### Task 21: Wire fill to the popup

**Files:**
- Create: `extension/src/inject.ts`
- Modify: `extension/entrypoints/popup/main.tsx`

- [ ] **Step 1: The injected function**

`chrome.scripting.executeScript` serialises the function and runs it in the page. It
therefore cannot close over imports — `findLoginFields` and `fillField` must be passed in
as source or duplicated inside. Use `func` with the two helpers inlined via `args`:

```ts
import { findLoginFields } from "./fields";
import { fillField } from "./fill";

export interface FillPayload {
  username: string;
  password: string;
  totp: string;
}

export type FillOutcome = "filled" | "no-form";

/**
 * Runs INSIDE the page. Receives three strings and nothing else - no key, no
 * item, no vault. The worst a bug here can do is type a wrong value into one
 * field on a tab the person explicitly invoked.
 *
 * Never submits. Filling and submitting are different decisions and only one of
 * them is ours.
 */
export function fillInPage(payload: FillPayload): FillOutcome {
  const fields = findLoginFields(document);
  if (!fields.password) return "no-form";

  if (payload.username && fields.username) fillField(fields.username, payload.username);
  fillField(fields.password, payload.password);
  if (payload.totp && fields.totp) fillField(fields.totp, payload.totp);

  return "filled";
}
```

WXT bundles `fillInPage` and its imports into the injected chunk when it is referenced
from `executeScript({ func })`; verify in Step 3 rather than assuming.

- [ ] **Step 2: Call it from the popup**

```ts
async function fillCurrentTab(itemId: string, hasTotp: boolean): Promise<FillOutcome> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("http")) return "no-form";

  const payload: FillPayload = {
    username: await vault.fieldValue(itemId, "username"),
    password: await vault.fieldValue(itemId, "password"),
    totp: hasTotp ? await vault.fieldValue(itemId, "totp") : "",
  };

  const [result] = await chrome.scripting.executeScript({
    // activeTab grants access to this one tab because the popup was opened by a
    // click. allFrames stays false: cross-origin iframe filling is out of scope
    // and getting it wrong is worse than not doing it.
    target: { tabId: tab.id, allFrames: false },
    func: fillInPage,
    args: [payload],
  });

  return (result?.result as FillOutcome | undefined) ?? "no-form";
}
```

On `"no-form"`, the popup shows "No login form on this page" and leaves the copy buttons
in place. Autofill fails often; it has to fail into something useful.

- [ ] **Step 3: Verify the injected bundle carries its helpers**

```bash
pnpm --filter @passio/extension build
grep -rl "findLoginFields\|getBoundingClientRect" extension/.output/chrome-mv3/ \
  && echo "helpers bundled" \
  || { echo "FAIL: fillInPage would throw ReferenceError in the page"; exit 1; }
```

- [ ] **Step 4: Gates, commit, push**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke
git add extension
git commit -m "feat(extension): fill the current tab from the popup"
git push origin main
```

---

# PHASE 6 — Auto-lock and polish

---

### Task 22: Configurable auto-lock and idle locking

**Files:**
- Create: `extension/src/prefs.ts`, `extension/src/prefs.test.ts`
- Modify: `extension/entrypoints/background.ts`, `extension/entrypoints/popup/main.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { LOCK_CHOICES, normaliseLockMinutes } from "./prefs";

describe("normaliseLockMinutes", () => {
  it("keeps a valid choice", () => {
    expect(normaliseLockMinutes(5)).toBe(5);
  });

  it("falls back to 15 for anything unrecognised", () => {
    for (const bad of [undefined, null, 0, -1, 9999, "15", NaN]) {
      expect(normaliseLockMinutes(bad)).toBe(15);
    }
  });

  it("never offers 'never'", () => {
    // A vault that never locks is a vault left open on a shared machine.
    expect(LOCK_CHOICES).not.toContain(0);
    expect(Math.max(...LOCK_CHOICES)).toBeLessThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run it, watch it fail, then implement `extension/src/prefs.ts`**

```ts
/** Minutes of idle before the vault locks. No "never": the extension holds a
 *  live vault key, and a browser left open on a shared machine is the exact
 *  situation auto-lock exists for. */
export const LOCK_CHOICES = [1, 5, 15, 30, 60] as const;
export const DEFAULT_LOCK_MINUTES = 15;

export function normaliseLockMinutes(value: unknown): number {
  return typeof value === "number" && (LOCK_CHOICES as readonly number[]).includes(value)
    ? value
    : DEFAULT_LOCK_MINUTES;
}
```

Expected after implementing: **3 passed**.

- [ ] **Step 3: Read the preference in the background worker**

Replace the hard-coded `DEFAULT_LOCK_MINUTES` in `resetLockAlarm` with a read from
`chrome.storage.local` through `normaliseLockMinutes`.

- [ ] **Step 4: Lock when the system locks**

```ts
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((state) => {
    // "locked" is the screen lock. Waiting out the idle timer after someone has
    // locked their laptop defeats the point of having locked it.
    if (state === "locked") {
      void chrome.runtime.sendMessage({ target: "offscreen", kind: "lock" });
    }
  });
```

- [ ] **Step 5: A settings row in the popup**

A `<select>` of `LOCK_CHOICES` and a "Lock now" button, in a footer under the list.

- [ ] **Step 6: Empty and error states**

- Vault with no items: "No items yet." plus a link that opens the web app to add one.
- Search with no results: "Nothing matches <query>."
- `damaged > 0`: a warning naming the count, with a line saying the ciphertext is intact
  in the vault and the web app may still read it.
- Offline / request failed: "Cannot reach passio." plus a retry button. Never a blank
  popup — a blank popup is indistinguishable from a broken extension.

- [ ] **Step 7: Final gates, commit, push**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke
git add -A
git commit -m "feat(extension): configurable auto-lock, idle locking and real empty states"
git push origin main
```

---

## Plan self-review

**Spec coverage.** Every spec section maps to a task: D1 → Tasks 13–15; D2 → Chrome-only
manifest, Task 7; D3/D3a → Task 7 manifest plus the Task 8 assertions; D4 → Tasks 9–10;
D5 → Task 7 Steps 2–3; D6 → Task 7 Step 5 plus the Task 8 assertion. Matching → Task 17.
Field detection → Task 19. Filling → Tasks 20–21. Message protocol → Task 12. Auto-lock →
Task 15 (fixed) and Task 22 (configurable). Error handling → Task 22 Step 6. The testing
strategy is realised by Task 8 and every TDD step.

**Deviations recorded:** the repo-root layout (documented at the top of this plan and in
`DECISIONS.md` at Task 6).

**Type consistency.** `ItemSummary`, `Request`, `Response`, `VaultState` are defined once
in Task 12 and used unchanged in Tasks 13–16 and 18. `CustodyDeps`/`CustodyApi` are
defined in Task 13 and satisfied in Task 14. `LoginFields` (Task 19) is consumed by
`fillInPage` (Task 21). `FillPayload`/`FillOutcome` are defined in Task 21 and used only
there. `matchItemsToUrl`/`MatchableItem` (Task 17) are consumed by custody in Task 18 —
`ItemSummary` has an optional `uri`, which satisfies `MatchableItem`.

**Known gap, accepted:** Task 16's popup UI and Task 22's Steps 5–6 are described by
behaviour rather than full source. They are presentational React with no branching logic
that a unit test would meaningfully cover, and every function they call is specified with
complete code and tests elsewhere in this plan.

---

# END-OF-RUN SUMMARY

**Run date:** 2026-09-12 · unattended · executed inline (not subagent-driven: the
monorepo split is one coherent whole-repo operation, poorly suited to isolated agents).

## Phases completed: all six

| Phase | Commit | Gates | Deploy |
|---|---|---|---|
| 1 — Monorepo split | `08fe230` | typecheck · lint · **354 tests / 28 files** · build · smoke | Ready |
| 2 — Shell + sign-in | `c9b6df7` | typecheck · lint · **373 tests / 31 files** · build · smoke | Ready |
| 3 — Offscreen custody (+4, +6) | `2694986` | typecheck · lint · **418 tests / 35 files** · build · smoke | Ready |
| 5 — Autofill | `1262c2e` | typecheck · lint · **451 tests / 38 files** · build · smoke | pending at write time |

Phases 4 and 6 landed inside phase 3's commit. Phase 4's `matchItemsToUrl` was pulled
forward because the message protocol already declared `matchCount`, and shipping a
protocol with a dead message kind is worse than crossing a phase boundary. Phase 6's
`chrome.alarms` / `chrome.idle` / configurable timeout landed with it because the
background worker needed the preference anyway, and no phase may leave a vault key
alive indefinitely.

Test count grew 354 → **451** (+97), every one written against behaviour specified in
the plan.

## Phases blocked: none

## Deviations from the spec

1. **`NEEDS-REVIEW`: the web app stays at the repo root, not `apps/web`.** Recorded in
   `DECISIONS.md`. Removes the Vercel Root Directory change the spec itself named as the
   highest deployment risk.
2. **Phase ordering compressed** as described above.
3. **The fill script is injected as a file, not as `executeScript({ func })`.** The plan
   assumed WXT would bundle a referenced function's imports into the injected chunk. It
   does not, and cannot: Chrome stringifies `func` at runtime, so imported helpers become
   free variables and throw `ReferenceError` in the page. Injecting a bundled content
   script with `registration: "runtime"` keeps `findLoginFields` and `fillField` as real
   tested modules, and keeps the manifest free of `content_scripts`.

## Things the plan got wrong, found by executing it

- **Vitest aliases must be anchored regexes.** A plain string alias prefix-matches, so
  `"@passio/crypto"` also swallowed `@passio/crypto/worker/derive` and rewrote it to
  `.../index.ts/worker/derive`. Eight test files stopped loading with no other symptom.
- **`tldts` defaults to `allowPrivateDomains: false`.** The plan's test for
  `alice.github.io` vs `bob.github.io` failed on first run and was right to: with the
  default, one tenant's login is offered on another tenant's page.
- **WXT's `postinstall` runs `wxt prepare`, which fails when no entrypoints exist yet.**
  Renamed to `prepare-types` and wired into `typecheck`, which needs it anyway because
  `.wxt/` is gitignored.
- **The root `tsconfig.json` cannot typecheck the extension.** WXT's auto-imported
  globals only exist under the extension's own config. `pnpm typecheck` now runs both.
- **`unbound-method` fires on reading `PropertyDescriptor.set`**, which is declared with
  method shorthand. Fixed by typing the descriptor slot as a property holding a function
  with an explicit `this`, and calling through `Reflect.apply`. No suppression was used.

## Verified by execution, not assumption

- No server code (`drizzle-orm`, `better-auth`, `postgres`) in the extension bundle,
  despite the type-only `AppRouter` import.
- Argon2id appears **only** in `assets/worker-*.js`. The popup chunk contains none, so
  the popup structurally cannot derive a key.
- The generated manifest contains no `content_scripts`, no `<all_urls>`, and exactly the
  seven designed permissions plus one host permission.
- `extension/key.pem` is gitignored and was confirmed absent from every staged commit.

## NOT verified — no browser on this machine

Unchanged from the spec, and the reason every extension phase ends in a handoff:

- **whether the offscreen document actually survives service-worker eviction** — the
  load-bearing assumption of the entire design
- whether the manifest loads in Chrome
- whether CORS and bearer auth work from `chrome-extension://olifgfoaipigflfaiadpjalokaoonjjo`
- whether autofill works on any real site
- any popup rendering
