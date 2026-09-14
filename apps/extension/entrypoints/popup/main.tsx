import "@passio/ui/styles.css";

import { searchSummaries } from "@passio/core/search";
import { matchItemsToUrl } from "@passio/core/match";
import { copyWithAutoClear } from "@passio/core/clipboard";
import { Button } from "@passio/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@passio/ui/dropdown-menu";
import { Field } from "@passio/ui/field";
import { Input } from "@passio/ui/input";
import { Skeleton } from "@passio/ui/skeleton";
import { Switch } from "@passio/ui/switch";
import { Toaster } from "@passio/ui/sonner";
import { VaultDataProvider } from "@passio/vault-ui/data";
import { EditItem } from "@passio/vault-ui/edit-item";
import { NavigationProvider } from "@passio/vault-ui/navigation";
import { NewItem } from "@passio/vault-ui/new-item";
import { GeneratorPanel } from "@passio/vault-ui/generator-panel";
import {
  ArrowLeft, ExternalLink, Lock, LogOut, MoreVertical, Plus,
  RefreshCw, Search, Settings, Shield, Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";

import { readEmail, writeEmail } from "../../src/chrome-storage";
import { vault } from "../../src/client";
import { ItemGlyph } from "../../src/item-glyph";
import type { FillField, ItemSummary, VaultState } from "../../src/messages";
import type { FillOutcome, FillPayload } from "../../src/inject";
import { useHashNavigation, usePath } from "../../src/hash-router";
import {
  dropInlineAccess,
  hasInlineAccess,
  requestInlineAccess,
} from "../../src/inline-permission";
import { popOut } from "../../src/pop-out";
import { LOCK_CHOICES, LOCK_MINUTES_KEY, normaliseLockMinutes } from "../../src/prefs";
import { useExtensionVaultData } from "../../src/vault-data";

/**
 * The popup frame.
 *
 * `tall` fixes the height for the tabbed screens so switching tabs does not
 * resize the window under the cursor, and pins the tab bar to the bottom
 * instead of letting it float up under short content. Unlock and the editors
 * size to their content.
 *
 * `overflow-hidden` matters as much as the height: without it a single wide
 * child gives the whole popup a horizontal scrollbar.
 */
function Shell({
  children,
  tall = false,
}: {
  children: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <div
      className={`bg-background text-foreground flex w-[400px] flex-col overflow-hidden ${
        tall ? "h-[560px]" : "min-h-[180px]"
      }`}
    >
      {children}
      <Toaster position="bottom-center" />
    </div>
  );
}

/** The scrolling middle of a tabbed screen. Grows to fill, scrolls vertically
 *  only, and never horizontally. */
function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
  );
}

function Header({
  title,
  onBack,
  onAdd,
  path,
}: {
  title: string;
  onBack?: () => void;
  onAdd?: () => void;
  path?: string;
}) {
  return (
    <header className="flex h-12 items-center gap-1.5 border-b px-3">
      {onBack ? (
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </Button>
      ) : null}

      <span className="ml-1 text-sm font-semibold tracking-tight">{title}</span>

      <span className="ml-auto flex items-center gap-1">
        {onAdd ? (
          <Button size="sm" onClick={onAdd}>
            <Plus />
            New
          </Button>
        ) : null}
        {path !== undefined ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void popOut(path)}
            aria-label="Open in a window"
          >
            <ExternalLink />
          </Button>
        ) : null}
      </span>
    </header>
  );
}

const TABS = [
  { path: "/", label: "Vault", Icon: Wallet },
  { path: "/generator", label: "Generator", Icon: RefreshCw },
  { path: "/settings", label: "Settings", Icon: Settings },
] as const;

/** Bottom navigation. Three destinations, always visible, so nothing is more
 *  than one tap away - and no "Send", which this product does not do. */
function TabBar({ path }: { path: string }) {
  return (
    <nav className="flex border-t">
      {TABS.map(({ path: to, label, Icon }) => {
        const active = to === path;
        return (
          <a
            key={to}
            href={`#${to}`}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
              active
                ? "text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * The editing screens, rendering the same components as the web app.
 *
 * Mounted ONLY on an edit route. The fill list deliberately runs on
 * `ItemSummary` values that carry no secrets; full plaintext enters the popup
 * here and nowhere else, and leaves again when this unmounts.
 */
function Editor({
  path,
  onLocked,
  onBack,
}: {
  path: string;
  onLocked: () => void;
  onBack: () => void;
}) {
  const navigation = useHashNavigation();
  const { data, error, reload } = useExtensionVaultData(onLocked);

  const body = error ? (
    <div className="grid gap-3 p-4">
      <p className="text-destructive text-sm">{error}</p>
      <Button variant="outline" onClick={reload} className="justify-self-start">
        Try again
      </Button>
    </div>
  ) : (
    <div className="max-h-[520px] overflow-y-auto p-4">
      {path === "/vault/new" ? (
        <NewItem />
      ) : (
        <EditItem itemId={/^\/vault\/(.+)$/.exec(path)?.[1] ?? ""} />
      )}
    </div>
  );

  return (
    <NavigationProvider value={navigation}>
      <VaultDataProvider value={data}>
        <Shell>
          <Header
            title={path === "/vault/new" ? "New item" : "Edit item"}
            onBack={onBack}
            path={path}
          />
          {body}
        </Shell>
      </VaultDataProvider>
    </NavigationProvider>
  );
}

function Unlock({ knownEmail, onDone }: { knownEmail: string | null; onDone: () => void }) {
  const [email, setEmail] = useState(knownEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await vault.unlock(email, password);
      await writeEmail(email);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <Shell>
      <Header title="passio" />
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 p-4">
        <div>
          <h1 className="text-sm font-semibold">
            {knownEmail ? "Welcome back" : "Sign in"}
          </h1>
          <p className="text-muted-foreground text-xs">
            {knownEmail ?? "Your vault is encrypted on this device."}
          </p>
        </div>

        {knownEmail ? null : (
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}

        <Field
          label="Master password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          secret
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
        />

        {/* Argon2id at 64 MiB takes about a second. A silent button reads as a
            broken one. */}
        <Button type="submit" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </Shell>
  );
}

function Row({
  item,
  canFill,
  onFill,
  onCopy,
  onOpen,
}: {
  item: ItemSummary;
  canFill: boolean;
  onFill: () => void;
  onCopy: (field: FillField) => void;
  onOpen: () => void;
}) {
  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 transition-colors">
      <ItemGlyph type={item.type} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {item.username ? (
          <span className="text-muted-foreground block truncate text-xs">
            {item.username}
          </span>
        ) : null}
      </span>

      {canFill && item.type === "login" ? (
        <Button size="sm" onClick={onFill}>
          Fill
        </Button>
      ) : null}

      {/* One menu rather than three more buttons. The web app's rows already
          work this way, and four equal-weight buttons per row made nothing
          read as the primary action. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.title}`} />
          }
        >
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.username ? (
            <DropdownMenuItem className="whitespace-nowrap" onClick={() => onCopy("username")}>
              Copy username
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="whitespace-nowrap" onClick={() => onCopy("password")}>
            Copy password
          </DropdownMenuItem>
          {item.hasTotp ? (
            <DropdownMenuItem className="whitespace-nowrap" onClick={() => onCopy("totp")}>
              Copy one-time code
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="whitespace-nowrap" onClick={onOpen}>
            Edit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/**
 * Turns the in-page suggestion overlay on and off.
 *
 * Reads the REAL permission rather than a stored preference: it can be revoked
 * from chrome://extensions at any time, and a toggle that disagreed with
 * reality would be worse than no toggle.
 *
 * `requestInlineAccess` is called straight from the change handler, because
 * Chrome only shows its consent prompt inside a user gesture - moving it behind
 * an await makes it fail silently, which reads exactly like a refusal.
 */
function InlineToggle() {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    void hasInlineAccess().then(setOn);
  }, []);

  function change(next: boolean) {
    const pending = next ? requestInlineAccess() : dropInlineAccess();
    void pending.then(() => hasInlineAccess()).then(setOn);
  }

  return (
    <SettingRow
      label="Suggest logins on form fields"
      hint="Lets passio see the pages you visit"
    >
      <Switch
        id="inline"
        checked={on ?? false}
        disabled={on === null}
        onCheckedChange={change}
      />
    </SettingRow>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground bg-muted/40 border-y px-4 py-1.5 text-[11px] font-medium tracking-wide">
      {children}
    </p>
  );
}

function Vault({ onLocked }: { onLocked: () => void }) {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [damaged, setDamaged] = useState(0);
  const [query, setQuery] = useState("");
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await vault.items();
      setItems(res.items);
      setDamaged(res.damaged);
    } catch (err) {
      if (err instanceof Error && /locked/i.test(err.message)) return onLocked();
      setError("Cannot reach passio.");
    }
  }, [onLocked]);

  useEffect(() => {
    void load();
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([t]) => setTabUrl(t?.url ?? null));
  }, [load]);

  const filtered = useMemo(
    () => (items ? searchSummaries(items, query) : []),
    [items, query],
  );
  const forSite = useMemo(
    () => (items && tabUrl ? matchItemsToUrl(items, tabUrl) : []),
    [items, tabUrl],
  );

  const canFill = tabUrl?.startsWith("http") ?? false;
  const showSite = forSite.length > 0 && query === "";
  const rest = showSite
    ? filtered.filter((i) => !forSite.some((m) => m.id === i.id))
    : filtered;

  async function copy(item: ItemSummary, field: FillField) {
    try {
      const value = await vault.fieldValue(item.id, field);
      if (!value) return toast.error("Nothing to copy.");
      if (await copyWithAutoClear(value)) {
        toast.success(`${field === "totp" ? "Code" : field} copied`, {
          description: "Your clipboard clears in 30 seconds.",
        });
      } else {
        toast.error("Could not copy", { description: "Your browser blocked access." });
      }
    } catch (err) {
      if (err instanceof Error && /locked/i.test(err.message)) return onLocked();
      toast.error("Could not copy.");
    }
  }

  async function fill(item: ItemSummary) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http")) {
      toast.error("Cannot fill this kind of page.");
      return;
    }
    try {
      const payload: FillPayload = {
        kind: "fill",
        username: item.username ? await vault.fieldValue(item.id, "username") : "",
        password: await vault.fieldValue(item.id, "password"),
        totp: item.hasTotp ? await vault.fieldValue(item.id, "totp") : "",
      };
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        files: ["content-scripts/fill.js"],
      });
      const outcome: FillOutcome = await chrome.tabs.sendMessage(tab.id, payload);
      if (outcome === "filled") {
        window.close();
        return;
      }
      // Autofill fails often; it has to fail into something useful.
      toast.error("No login form on this page.", {
        description: "Use the menu to copy instead.",
      });
    } catch (err) {
      if (err instanceof Error && /locked/i.test(err.message)) return onLocked();
      toast.error("Could not fill this page.");
    }
  }

  function edit(itemId: string) {
    window.location.hash = `/vault/${itemId}`;
  }


  if (error) {
    return (
      <Shell tall>
        <Header title="Vault" />
        <Body>
        <div className="grid gap-3 p-4">
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
        </Body>
        <TabBar path="/" />
      </Shell>
    );
  }

  if (!items) {
    return (
      <Shell tall>
        <Header title="Vault" />
        <Body>
        <div className="grid gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
          ))}
        </div>
        </Body>
        <TabBar path="/" />
      </Shell>
    );
  }

  const rowProps = (i: ItemSummary) => ({
    item: i,
    canFill,
    onFill: () => void fill(i),
    onCopy: (f: FillField) => void copy(i, f),
    onOpen: () => edit(i.id),
  });

  return (
    <Shell tall>
      <Header
        title="Vault"
        onAdd={() => (window.location.hash = "/vault/new")}
        path="/"
      />

      <div className="p-3">
        <div className="relative flex items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your vault"
            aria-label="Search your vault"
            className="pl-9"
          />
        </div>
      </div>

      {damaged > 0 ? (
        <p className="text-destructive px-4 pb-2 text-xs">
          {damaged} item{damaged === 1 ? "" : "s"} could not be decrypted. Nothing is
          lost — open the full vault to look.
        </p>
      ) : null}

      <Body>
        {items.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            Your vault is empty. Add your first item in the full vault.
          </p>
        ) : null}

        {showSite ? (
          <>
            <SectionLabel>For this site</SectionLabel>
            <ul>
              {forSite.map((i) => (
                <Row key={i.id} {...rowProps(i)} />
              ))}
            </ul>
          </>
        ) : null}

        {rest.length > 0 ? (
          <>
            {showSite ? <SectionLabel>All items</SectionLabel> : null}
            <ul>
              {rest.map((i) => (
                <Row key={i.id} {...rowProps(i)} />
              ))}
            </ul>
          </>
        ) : query !== "" ? (
          <p className="text-muted-foreground p-4 text-sm">Nothing matches “{query}”.</p>
        ) : null}
      </Body>

      <TabBar path="/" />
    </Shell>
  );
}

/**
 * The generator, as a tab.
 *
 * Renders @passio/vault-ui's GeneratorPanel — the same component the web app's
 * "Generate a password" dialog uses — so the two cannot drift into producing
 * passwords under different rules.
 */
function GeneratorTab() {
  return (
    <Shell tall>
      <Header title="Generator" path="/generator" />
      <Body>
        <div className="p-4">
        <GeneratorPanel
          footer={({ candidate, regenerate }) => (
            <div className="flex gap-2">
              <Button variant="outline" onClick={regenerate} className="flex-1">
                <RefreshCw />
                Regenerate
              </Button>
              <Button
                disabled={!candidate}
                className="flex-1"
                onClick={() => {
                  void copyWithAutoClear(candidate).then((ok) =>
                    ok
                      ? toast.success("Password copied", {
                          description: "Your clipboard clears in 30 seconds.",
                        })
                      : toast.error("Could not copy"),
                  );
                }}
              >
                Copy
              </Button>
            </div>
            )}
          />
        </div>
      </Body>
      <TabBar path="/generator" />
    </Shell>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-tight">{label}</span>
        {hint ? (
          <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
            {hint}
          </span>
        ) : null}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

/** Everything that configures the extension, in one place rather than wedged
 *  into the bottom of the item list. */
function SettingsTab({ email, onLocked }: { email: string | null; onLocked: () => void }) {
  const [lockMinutes, setLockMinutes] = useState(15);

  useEffect(() => {
    void chrome.storage.local
      .get(LOCK_MINUTES_KEY)
      .then((s) => setLockMinutes(normaliseLockMinutes(s[LOCK_MINUTES_KEY])));
  }, []);

  async function changeLock(minutes: number) {
    setLockMinutes(minutes);
    await chrome.storage.local.set({ [LOCK_MINUTES_KEY]: minutes });
  }

  return (
    <Shell tall>
      <Header title="Settings" />
      <Body>
        <div className="divide-y">
        <div className="px-4 py-3">
          <p className="text-sm font-medium">{email ?? "Signed in"}</p>
          <p className="text-muted-foreground text-xs">
            Your vault is encrypted on this device.
          </p>
        </div>

        <div>
          <SectionLabel>Autofill</SectionLabel>
          <InlineToggle />
        </div>

        <div>
          <SectionLabel>Security</SectionLabel>
          <SettingRow label="Lock after" hint="Idle time before the vault re-locks">
            <select
              value={lockMinutes}
              onChange={(e) => void changeLock(Number(e.target.value))}
              aria-label="Lock after"
              className="border-input bg-background h-7 rounded-md border px-1.5 text-xs"
            >
              {LOCK_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Lock now" hint="Forget the key until you unlock again">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void vault.lock().then(onLocked)}
            >
              <Lock />
              Lock
            </Button>
          </SettingRow>
        </div>

        <div>
          <SectionLabel>Account</SectionLabel>
          <SettingRow label="Open full vault" hint="Folders, trash and everything else">
            <Button variant="outline" size="sm" onClick={() => void popOut("/vault")}>
              <ExternalLink />
              Open
            </Button>
          </SettingRow>
          <SettingRow label="Sign out" hint="Also forgets this device's session">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void vault.signOut().then(onLocked)}
            >
              <LogOut />
              Sign out
            </Button>
          </SettingRow>
        </div>

          <p className="text-muted-foreground flex items-start gap-2 px-4 py-3.5 text-[11px] leading-relaxed">
            <Shield className="mt-px size-3.5 shrink-0" />
            <span>
              Your master password never leaves this device, and neither does the key
              it derives.
            </span>
          </p>
        </div>
      </Body>
      <TabBar path="/settings" />
    </Shell>
  );
}

function App() {
  const [state, setState] = useState<VaultState | "loading">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const path = usePath("/");

  const refresh = useCallback(async () => {
    setEmail(await readEmail());
    setState(await vault.status());
  }, []);

  useEffect(() => void refresh(), [refresh]);

  if (state === "loading") {
    return (
      <Shell>
        <Header title="passio" />
        <p className="text-muted-foreground p-4 text-sm">Checking…</p>
      </Shell>
    );
  }

  if (state !== "unlocked") {
    return (
      <Unlock
        knownEmail={state === "locked" ? email : null}
        onDone={() => setState("unlocked")}
      />
    );
  }

  // Editors take over the whole popup: they have their own back button, and a
  // tab bar under a half-finished item invites losing it.
  if (path === "/vault/new" || /^\/vault\/.+$/.test(path)) {
    return (
      <Editor
        path={path}
        onLocked={() => setState("locked")}
        onBack={() => (window.location.hash = "/")}
      />
    );
  }

  if (path === "/generator") return <GeneratorTab />;
  if (path === "/settings") {
    return <SettingsTab email={email} onLocked={() => setState("locked")} />;
  }

  return <Vault onLocked={() => setState("locked")} />;
}

createRoot(document.getElementById("root")!).render(<App />);
