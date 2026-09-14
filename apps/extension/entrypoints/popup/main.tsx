import "@passio/ui/styles.css";

import { searchSummaries } from "@passio/core/search";
import { applySummaryFilter, countFilters, type VaultFilter } from "@passio/core/filter";
import { matchItemsToUrl } from "@passio/core/match";
import { copyWithAutoClear } from "@passio/core/clipboard";
import { Button } from "@passio/ui/button";
import { CipherReadout } from "@passio/ui/cipher-readout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@passio/ui/dropdown-menu";
import { Field } from "@passio/ui/field";
import { Input } from "@passio/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@passio/ui/select";
import { Skeleton } from "@passio/ui/skeleton";
import { Switch } from "@passio/ui/switch";
import { Toaster } from "@passio/ui/sonner";
import { Wordmark } from "@passio/ui/wordmark";
import { VaultDataProvider } from "@passio/vault-ui/data";
import { EditItem } from "@passio/vault-ui/edit-item";
import { ItemMark } from "@passio/vault-ui/item-mark";
import { NavigationProvider } from "@passio/vault-ui/navigation";
import { NewItem } from "@passio/vault-ui/new-item";
import { GeneratorPanel } from "@passio/vault-ui/generator-panel";
import { SettingsGroup, SettingsRow } from "@passio/vault-ui/settings-list";
import { VaultFilters } from "@passio/vault-ui/vault-filters";
import {
  ArrowLeft, ExternalLink, Lock, LogOut, MoreVertical, Plus, RefreshCw, Search, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";

import { readEmail, writeEmail } from "../../src/chrome-storage";
import { vault } from "../../src/client";
import type {
  FillField,
  FolderSummary,
  ItemSummary,
  VaultState,
} from "../../src/messages";
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
 * resize the window under the cursor. Unlock and the editors size to their
 * content.
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

const TABS = [
  { path: "/", label: "Vault" },
  { path: "/generator", label: "Generator" },
  { path: "/settings", label: "Settings" },
] as const;

/**
 * Navigation, as a segmented control in the header.
 *
 * It used to be a bar of icon-and-label tabs pinned to the bottom edge, which
 * is where every other password manager puts it. Moving it to the top puts
 * navigation where the eye starts, and buys back 44px of a 560px window - a
 * whole extra row of the list.
 */
function SegmentedNav({ path }: { path: string }) {
  return (
    <nav className="bg-muted flex rounded-full p-0.5" aria-label="Sections">
      {TABS.map(({ path: to, label }) => {
        const active = to === path;
        return (
          <a
            key={to}
            href={`#${to}`}
            aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-full px-3 py-1 text-center text-[12px] leading-5 transition-colors ${
              active
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

/** The header of a tabbed screen: the mark, the sections, and the way out. */
function TabHeader({ path, onAdd }: { path: string; onAdd?: () => void }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <Wordmark size="sm" showName={false} />
      <div className="min-w-0 flex-1">
        <SegmentedNav path={path} />
      </div>
      {onAdd ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={onAdd}
          aria-label="Add item"
        >
          <Plus />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        onClick={() => void popOut(path === "/" ? "/vault" : path)}
        aria-label="Open in a window"
      >
        <ExternalLink />
      </Button>
    </header>
  );
}

/** The header of a screen that took over the popup: back, title, and nothing
 *  else competing with the form below it. */
function StackHeader({
  title,
  onBack,
  path,
}: {
  title: string;
  onBack: () => void;
  path?: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3">
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeft />
      </Button>
      <span className="font-medium">{title}</span>
      {path !== undefined ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto rounded-full"
          onClick={() => void popOut(path)}
          aria-label="Open in a window"
        >
          <ExternalLink />
        </Button>
      ) : null}
    </header>
  );
}

/** A failure that says what happened and offers the way out of it. */
function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid justify-items-center gap-1 px-6 py-12 text-center">
      <p className="font-medium">{message}</p>
      <p className="text-muted-foreground max-w-[17rem] text-[13px] leading-relaxed">
        Your vault is unharmed. This is usually a dropped connection.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Try again
      </Button>
    </div>
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
    <Problem message={error} onRetry={reload} />
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
          <StackHeader
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
      <form onSubmit={(e) => void submit(e)} className="grid gap-5 p-5">
        <Wordmark size="md" />

        <div className="grid gap-0.5">
          <h1 className="text-base">{knownEmail ? "Welcome back" : "Sign in"}</h1>
          <p className="text-muted-foreground text-[13px]">
            {knownEmail ?? "Your vault is encrypted on this device."}
          </p>
        </div>

        {knownEmail ? null : (
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            required
            disabled={busy}
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
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
        />

        {/* Argon2id at 64 MiB takes about a second. The readout says what that
            second is for, in the same face the key itself is shown in. */}
        {busy ? (
          <CipherReadout label="Deriving your key on this device…" />
        ) : (
          <Button type="submit" size="lg">
            Unlock vault
          </Button>
        )}
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
    <li className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2 transition-colors">
      <ItemMark name={item.title} type={item.type} size="sm" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{item.title}</span>
        {item.username ? (
          <span className="text-muted-foreground block truncate text-[11.5px]">
            {item.username}
          </span>
        ) : null}
      </span>

      {canFill && item.type === "login" ? (
        <Button size="xs" onClick={onFill}>
          Fill
        </Button>
      ) : null}

      {/* One menu rather than three more buttons. Four equal-weight buttons per
          row made nothing read as the primary action. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={`Actions for ${item.title}`}
            />
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
    <SettingsRow
      label="Suggest logins on form fields"
      hint="Lets passio see the pages you visit"
    >
      <Switch
        id="inline"
        checked={on ?? false}
        disabled={on === null}
        onCheckedChange={change}
      />
    </SettingsRow>
  );
}

/**
 * The heading above a run of rows.
 *
 * Sentence case at reading size, on the page ground. The version this replaced
 * was a tinted, tracked-out, all-caps band between every group, which made two
 * short lists look like a settings screen.
 */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground px-3 pt-3 pb-1.5 text-[11.5px] font-medium">
      {children}
    </p>
  );
}

/** Nothing to show, and what to do about it. */
function Nothing({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-1 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint ? (
        <p className="text-muted-foreground max-w-[17rem] text-[13px] leading-relaxed">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

function Vault({ onLocked }: { onLocked: () => void }) {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [damaged, setDamaged] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VaultFilter>({ kind: "all" });
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, folderList] = await Promise.all([vault.items(), vault.folders()]);
      setItems(res.items);
      setDamaged(res.damaged);
      setFolders(folderList);
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

  const knownFolderIds = useMemo(
    () => new Set(folders.map((f) => f.id)),
    [folders],
  );

  /**
   * Search, then the filter.
   *
   * Both are the shared implementations, so "no folder" still includes an item
   * pointing at a folder that no longer exists rather than hiding it - exactly
   * as it does in the web app.
   */
  const filtered = useMemo(() => {
    if (!items) return [];
    return applySummaryFilter(searchSummaries(items, query), filter, knownFolderIds);
  }, [items, query, filter, knownFolderIds]);

  const counts = useMemo(
    () => countFilters(items ?? [], knownFolderIds),
    [items, knownFolderIds],
  );

  const filtering = filter.kind !== "all";
  const searching = query.trim().length > 0;

  const forSite = useMemo(
    () => (items && tabUrl ? matchItemsToUrl(items, tabUrl) : []),
    [items, tabUrl],
  );

  const canFill = tabUrl?.startsWith("http") ?? false;
  const showSite = forSite.length > 0 && !searching && !filtering;
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
        <TabHeader path="/" />
        <Body>
          <Problem message={error} onRetry={() => void load()} />
        </Body>
      </Shell>
    );
  }

  if (!items) {
    return (
      <Shell tall>
        <TabHeader path="/" />
        <Body>
          <div className="grid gap-4 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-7 rounded-full" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        </Body>
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
      <TabHeader path="/" onAdd={() => (window.location.hash = "/vault/new")} />

      <div className="grid shrink-0 gap-2.5 p-3">
        <div className="relative flex items-center">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your vault"
            aria-label="Search your vault"
            className="h-9 rounded-lg pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {searching ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="text-muted-foreground absolute right-1.5 rounded-full"
            >
              <X />
            </Button>
          ) : null}
        </div>

        {/* The same rail the web app uses. A filter cannot mean two different
            things in two windows if there is only one of it. */}
        <VaultFilters
          filter={filter}
          onFilterChange={(next) => {
            setQuery("");
            setFilter(next);
          }}
          folders={folders}
          counts={counts}
        />
      </div>

      {damaged > 0 ? (
        <p className="text-destructive shrink-0 px-3 pb-2 text-[11.5px]">
          {damaged} item{damaged === 1 ? "" : "s"} could not be decrypted. Nothing is
          lost — open the full vault to look.
        </p>
      ) : null}

      <Body>
        {items.length === 0 ? (
          <Nothing
            title="Your vault is empty"
            hint="Add a login and passio will offer it the next time you meet that sign-in form."
            action={
              <Button
                size="sm"
                onClick={() => (window.location.hash = "/vault/new")}
              >
                <Plus />
                Add your first item
              </Button>
            }
          />
        ) : null}

        {showSite ? (
          <>
            <GroupLabel>For this site</GroupLabel>
            <ul>
              {forSite.map((i) => (
                <Row key={i.id} {...rowProps(i)} />
              ))}
            </ul>
          </>
        ) : null}

        {rest.length > 0 ? (
          <>
            {showSite ? <GroupLabel>Everything else</GroupLabel> : null}
            <ul>
              {rest.map((i) => (
                <Row key={i.id} {...rowProps(i)} />
              ))}
            </ul>
          </>
        ) : items.length > 0 && !showSite ? (
          <Nothing
            title={
              searching ? `Nothing matches “${query.trim()}”` : "Nothing in this filter"
            }
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilter({ kind: "all" });
                }}
              >
                Show all items
              </Button>
            }
          />
        ) : null}
      </Body>
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
      <TabHeader path="/generator" />
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
    </Shell>
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

  // Base UI renders the raw value unless the root is told how to label it,
  // which is what once showed a bare uuid in the item form.
  const lockLabels = Object.fromEntries(
    LOCK_CHOICES.map((m) => [String(m), `${m} min`]),
  );

  return (
    <Shell tall>
      <TabHeader path="/settings" />
      <Body>
        <div className="grid gap-7 p-4">
          <SettingsGroup title="Autofill">
            <InlineToggle />
          </SettingsGroup>

          <SettingsGroup title="Security">
            <SettingsRow label="Lock after" hint="Idle time before the vault re-locks">
              <Select
                items={lockLabels}
                value={String(lockMinutes)}
                onValueChange={(v: string | null) =>
                  void changeLock(normaliseLockMinutes(Number(v)))
                }
              >
                <SelectTrigger aria-label="Lock after" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCK_CHOICES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>

            <SettingsRow label="Lock now" hint="Forget the key until you unlock again">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void vault.lock().then(onLocked)}
              >
                <Lock />
                Lock
              </Button>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Account" description={email ?? undefined}>
            <SettingsRow label="Open full vault" hint="Folders, trash and everything else">
              <Button variant="outline" size="sm" onClick={() => void popOut("/vault")}>
                <ExternalLink />
                Open
              </Button>
            </SettingsRow>

            <SettingsRow label="Sign out" hint="Also forgets this device's session">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void vault.signOut().then(onLocked)}
              >
                <LogOut />
                Sign out
              </Button>
            </SettingsRow>
          </SettingsGroup>

          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            Your master password never leaves this device, and neither does the key
            it derives.
          </p>
        </div>
      </Body>
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
        <div className="grid gap-5 p-5">
          <Wordmark size="md" />
          <p className="text-muted-foreground text-[13px]">Checking your vault…</p>
        </div>
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
