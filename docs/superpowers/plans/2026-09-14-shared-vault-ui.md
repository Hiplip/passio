# Shared Vault UI Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The extension gains full vault functionality — create, edit, delete, folders,
trash — looking exactly like the web app, without the UI existing twice.

**Architecture:** Extract the interface into `packages/ui` (design tokens + shadcn
primitives) and `packages/vault-ui` (vault components). Both surfaces render the *same*
components; each supplies its own navigation and data adapter. The web app keeps tRPC
and an in-memory key; the extension routes everything through the offscreen document.

**Tech Stack:** pnpm workspaces · React 19 · Base UI · Tailwind v4 · WXT · tRPC

---

## Why extraction rather than a second UI

Full parity built separately means every change lands twice and the two drift — the
failure mode is a fix applied to the web app that silently never reaches the extension,
in a product where the UI is how you tell a real credential from a wrong one.

The survey says extraction is cheap. Across `components/ui/*` and `components/vault/*`
the only non-portable imports are:

| Import | Files | Handling |
|---|---|---|
| `"use client"` | many | inert outside Next; left in place |
| `next/link` | 3 | behind a `Navigation` context |
| `next/navigation` (`useRouter`) | 1 | same context |
| `next-themes` | 1 (`sonner.tsx`) | **already a no-op** — no ThemeProvider is mounted, so `useTheme()` returns the default. Replaced with a prop. |

Everything else is `react`, `@base-ui/react`, `lucide-react`, `sonner`, `cva`, `cn`,
`@passio/core`.

## The one security consequence, stated up front

Today the extension's popup holds **no secrets**: it renders `ItemSummary` values and
requests one field at a time. A full editor cannot work that way — editing an item means
holding its plaintext.

**What does not change:** the vault key still exists only in the offscreen document. It
is never serialised, never messaged, never in the page.

**What does change:** the editor page receives the plaintext of the item being edited,
and sends edited plaintext back for the offscreen document to encrypt. Plaintext already
crosses this boundary for copy and fill, so this is a difference of degree, not of kind —
but it is a real widening and belongs in `DECISIONS.md` as `NEEDS-REVIEW`.

Encryption stays in the offscreen document. The page never encrypts, because that would
require the key.

---

## File structure

```
packages/
├── ui/                       @passio/ui — design system, no vault concepts
│   ├── src/
│   │   ├── styles.css            (from apps/web/src/styles/globals.css)
│   │   ├── cn.ts                 (from apps/web/src/lib/utils.ts)
│   │   └── *.tsx                 the 18 primitives from components/ui/
│   └── package.json
│
└── vault-ui/                 @passio/vault-ui — vault components
    ├── src/
    │   ├── navigation.tsx        Navigation context: Link + navigate()
    │   ├── data.tsx              VaultData context: the adapter interface
    │   ├── item-form.tsx  item-list.tsx  item-row-actions.tsx
    │   ├── secret-field.tsx  totp-display.tsx  field.tsx
    │   ├── folder-dialog.tsx  generator-dialog.tsx
    │   ├── vault-overview.tsx  vault-sidebar.tsx  vault-browser.tsx
    │   └── item-editor.tsx
    └── package.json

apps/web/                     provides Next Link/router + tRPC adapter
apps/extension/
├── entrypoints/vault/        NEW full-page tab, renders the shared UI
└── entrypoints/popup/        redesigned on @passio/ui
```

---

# PHASE 1 — `@passio/ui`

**Proves:** the web app renders identically from a shared package.

### Task 1: Create the package and move the design tokens

- [ ] `packages/ui/package.json`, name `@passio/ui`, `"exports": { "./*": "./src/*" }`,
      deps: `@base-ui/react`, `lucide-react`, `sonner`, `class-variance-authority`,
      `clsx`, `tailwind-merge`, peer `react`.
- [ ] `git mv apps/web/src/styles/globals.css packages/ui/src/styles.css`
- [ ] `git mv apps/web/src/lib/utils.ts packages/ui/src/cn.ts`
- [ ] `apps/web/src/app/layout.tsx` imports `@passio/ui/styles.css`.
- [ ] Tailwind v4 scans source via `@source`. Add to `styles.css` so classes used inside
      the packages are not purged:
      ```css
      @source "../../vault-ui/src";
      @source "../src";
      @source "../../../apps/web/src";
      @source "../../../apps/extension";
      ```
      **Without this every class used only in a package is stripped and the UI renders
      unstyled.** Verify by grepping the built CSS for a package-only class.

### Task 2: Move the primitives

- [ ] `git mv apps/web/src/components/ui/* packages/ui/src/`
- [ ] Rewrite `~/lib/utils` → `./cn` inside them.
- [ ] `sonner.tsx`: drop `next-themes`, take `theme?: ToasterProps["theme"]` defaulting
      to `"system"`. Behaviour is unchanged because no ThemeProvider was ever mounted.
- [ ] Rewrite app imports `~/components/ui/x` → `@passio/ui/x`.
- [ ] Gates. **451+ tests, and the rendered CSS must still contain the design tokens.**

### Task 3: Commit and deploy

- [ ] All five gates, then push. Web app must be pixel-identical.

---

# PHASE 2 — `@passio/vault-ui`

**Proves:** the vault UI runs with its Next dependencies injected rather than imported.

### Task 4: Navigation context

- [ ] `packages/vault-ui/src/navigation.tsx`:
      ```tsx
      export interface Navigation {
        navigate: (to: string) => void;
        Link: React.ComponentType<{
          href: string; className?: string; children: React.ReactNode;
        }>;
      }
      ```
      Context + `useNavigation()` that throws outside a provider, matching `useVault`.
- [ ] Web provides `next/link` and `useRouter().push`.

### Task 5: Data adapter context

- [ ] `packages/vault-ui/src/data.tsx` — the full surface the components need:
      ```tsx
      export interface VaultData {
        items: { data: DecryptedItem[]; isLoading: boolean; refetch: () => void };
        deletedItems: { data: DecryptedItem[]; isLoading: boolean };
        folders: { data: DecryptedFolder[]; isLoading: boolean };
        createItem: (item: Item) => Promise<string>;
        updateItem: (id: string, item: Item) => Promise<void>;
        deleteItem: (id: string) => Promise<void>;
        restoreItem: (id: string) => Promise<void>;
        createFolder: (name: string) => Promise<void>;
        renameFolder: (id: string, name: string) => Promise<void>;
        deleteFolder: (id: string) => Promise<void>;
      }
      ```
- [ ] `createItem` returns the id, because the id is the AAD and the caller needs it.

### Task 6: Move the vault components

- [ ] `git mv` the nine `components/vault/*` plus `app/vault/vault-browser.tsx` and
      `app/vault/item-editor.tsx` into `packages/vault-ui/src/`.
- [ ] Replace direct `api.*` and `useVault()` use with `useVaultData()`.
- [ ] Replace `next/link` with `useNavigation().Link`.
- [ ] Web app pages become thin: providers plus the shared component.
- [ ] Gates. The web app must behave exactly as before — same routes, same flows.

---

# PHASE 3 — Extension popup on the shared design system

**Proves:** the extension renders `@passio/ui` and looks like passio.

### Task 7: Tailwind in the extension

- [ ] `pnpm --filter @passio/extension add -D @tailwindcss/vite`
- [ ] `wxt.config.ts`: `vite: () => ({ plugins: [tailwind()] })`
- [ ] Popup imports `@passio/ui/styles.css`; delete the hand-written `styles.css`.
- [ ] Verify the built popup CSS contains the design tokens, not just resets.

### Task 8: Redesign the popup

Fixing what the screenshot showed: twelve equal-weight buttons, no scannable hierarchy,
border noise, weak section headers.

- [ ] One **Fill** as the primary action per row; copy actions in a quieter cluster.
- [ ] A type glyph per row so items are distinguishable at a glance.
- [ ] Section headers in the web app's muted-label style.
- [ ] Footer: replace the bare `<select>` with the shared `Select`, and add an
      **Open full vault** button (Phase 4's page).
- [ ] Empty, loading and error states using the shared components.

---

# PHASE 4 — The full vault page

**Proves:** the goal — create, edit, delete, folders and trash, inside the extension.

### Task 9: Offscreen write operations

- [ ] Extend the message protocol: `itemsFull`, `createItem`, `updateItem`,
      `deleteItem`, `restoreItem`, `folders`, `createFolder`, `renameFolder`,
      `deleteFolder`.
- [ ] `itemsFull` returns **decrypted items**, unlike `items` which returns summaries.
      The popup keeps using `items`; only the editor page uses `itemsFull`.
- [ ] Custody encrypts with `encryptItem(value, key, itemAad(id))` and generates the id
      with `crypto.randomUUID()` **before** encrypting — the id is the AAD.
- [ ] Tests: every new operation, against the existing fake-deps harness.

### Task 10: The page

- [ ] `apps/extension/entrypoints/vault/index.html` + `main.tsx` → `vault.html`.
- [ ] A hash router (`#/`, `#/item/:id`, `#/new`) supplying `Navigation`.
- [ ] A `VaultData` adapter over the message client.
- [ ] Popup's **Open full vault** calls `chrome.tabs.create({ url: "vault.html" })`.
- [ ] `bundle.test.ts`: assert the vault page chunk contains no `argon2` and the
      offscreen chunk still uses only `chrome.runtime`.

### Task 11: Record and hand off

- [ ] `DECISIONS.md`: `NEEDS-REVIEW` for plaintext reaching the editor page.
- [ ] Update `CLAUDE.md` and `docs/EXTENSION-HANDOFF.md`.
