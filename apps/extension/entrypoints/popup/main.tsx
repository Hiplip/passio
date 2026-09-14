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
import { Toaster } from "@passio/ui/sonner";
import { VaultDataProvider } from "@passio/vault-ui/data";
import { EditItem } from "@passio/vault-ui/edit-item";
import { NavigationProvider } from "@passio/vault-ui/navigation";
import { NewItem } from "@passio/vault-ui/new-item";
import {
  ArrowLeft, ExternalLink, KeyRound, Lock, MoreVertical, Plus, Search,
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
import { popOut } from "../../src/pop-out";
import { LOCK_CHOICES, LOCK_MINUTES_KEY, normaliseLockMinutes } from "../../src/prefs";
import { useExtensionVaultData } from "../../src/vault-data";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-[180px] w-[400px]">
      {children}
      <Toaster position="bottom-center" />
    </div>
  );
}

function Header({
  onLock,
  onBack,
  onAdd,
  path,
}: {
  onLock?: () => void;
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
      ) : (
        <>
          <span className="bg-primary text-primary-foreground ml-1 grid size-6 place-items-center rounded-md">
            <KeyRound className="size-3" />
          </span>
          <span className="text-sm font-semibold tracking-tight">passio</span>
        </>
      )}

      <span className="ml-auto flex items-center gap-1">
        {onAdd ? (
          <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label="Add item">
            <Plus />
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
        {onLock ? (
          <Button variant="ghost" size="sm" onClick={onLock}>
            <Lock />
            Lock
          </Button>
        ) : null}
      </span>
    </header>
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
          <Header onBack={onBack} path={path} />
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
      <Header />
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
  const [lockMinutes, setLockMinutes] = useState(15);

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
    void chrome.storage.local
      .get(LOCK_MINUTES_KEY)
      .then((s) => setLockMinutes(normaliseLockMinutes(s[LOCK_MINUTES_KEY])));
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

  async function changeLock(minutes: number) {
    setLockMinutes(minutes);
    await chrome.storage.local.set({ [LOCK_MINUTES_KEY]: minutes });
  }

  if (error) {
    return (
      <Shell>
        <Header onLock={() => void vault.lock().then(onLocked)} />
        <div className="grid gap-3 p-4">
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </Shell>
    );
  }

  if (!items) {
    return (
      <Shell>
        <Header />
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
    <Shell>
      <Header
        onLock={() => void vault.lock().then(onLocked)}
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

      <div className="max-h-[380px] overflow-y-auto">
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
      </div>

      <footer className="flex items-center gap-2 border-t p-3">
        <label htmlFor="lock" className="text-muted-foreground text-xs">
          Lock after
        </label>
        <select
          id="lock"
          value={lockMinutes}
          onChange={(e) => void changeLock(Number(e.target.value))}
          className="border-input bg-background h-7 rounded-md border px-1.5 text-xs"
        >
          {LOCK_CHOICES.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </footer>
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
        <Header />
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

  // "/" is the fill list, which holds no secrets. Anything under /vault is an
  // editor, and only those mount the full-plaintext provider.
  if (path === "/vault/new" || /^\/vault\/.+$/.test(path)) {
    return (
      <Editor
        path={path}
        onLocked={() => setState("locked")}
        onBack={() => (window.location.hash = "/")}
      />
    );
  }

  return <Vault onLocked={() => setState("locked")} />;
}

createRoot(document.getElementById("root")!).render(<App />);
