import { copyWithAutoClear } from "@passio/core/clipboard";
import { matchItemsToUrl } from "@passio/core/match";
import { searchSummaries } from "@passio/core/search";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { readEmail, writeEmail } from "../../src/auth";
import { vault } from "../../src/client";
import type { FillField, ItemSummary, VaultState } from "../../src/messages";
import type { FillOutcome, FillPayload } from "../../src/inject";
import { LOCK_CHOICES, LOCK_MINUTES_KEY, normaliseLockMinutes } from "../../src/prefs";
import "./styles.css";

const OPEN_APP = "https://passio-hiplip.vercel.app/vault";

function Unlock({
  knownEmail,
  onDone,
}: {
  knownEmail: string | null;
  onDone: () => void;
}) {
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
    <main className="pad">
      <h1>passio</h1>
      <form onSubmit={(e) => void submit(e)}>
        {knownEmail ? (
          <p className="muted small">{knownEmail}</p>
        ) : (
          <>
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}
        <label htmlFor="password">Master password</label>
        <input
          id="password" type="password" autoComplete="current-password" required
          autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="error">{error}</p> : null}
        {/* Argon2id at 64 MiB takes about a second. A silent button reads as a
            broken one. */}
        <button type="submit" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}

function Row({
  item,
  canFill,
  onCopy,
  onFill,
}: {
  item: ItemSummary;
  canFill: boolean;
  onCopy: (f: FillField) => void;
  onFill: () => void;
}) {
  return (
    <li className="row">
      <div className="rowMain">
        <span className="rowTitle">{item.title}</span>
        {item.username ? <span className="rowSub">{item.username}</span> : null}
      </div>
      <div className="rowActions">
        {canFill && item.type === "login" ? (
          <button className="chip primary" onClick={onFill}>Fill</button>
        ) : null}
        {item.username ? (
          <button className="chip" onClick={() => onCopy("username")}>User</button>
        ) : null}
        <button className="chip" onClick={() => onCopy("password")}>Pass</button>
        {item.hasTotp ? (
          <button className="chip" onClick={() => onCopy("totp")}>Code</button>
        ) : null}
      </div>
    </li>
  );
}

function Vault({ onLocked }: { onLocked: () => void }) {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [damaged, setDamaged] = useState(0);
  const [query, setQuery] = useState("");
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
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

  async function copy(item: ItemSummary, field: FillField) {
    try {
      const value = await vault.fieldValue(item.id, field);
      if (!value) return setNote("Nothing to copy.");
      setNote(
        (await copyWithAutoClear(value))
          ? `${field === "totp" ? "Code" : field} copied — clipboard clears in 30s.`
          : "Your browser blocked clipboard access.",
      );
    } catch (err) {
      if (err instanceof Error && /locked/i.test(err.message)) return onLocked();
      setNote("Could not copy.");
    }
  }

  /**
   * Fills the active tab.
   *
   * Injects the fill script first: activeTab grants access to this one tab
   * because the popup was opened by a click, and allFrames stays false because
   * cross-origin iframe filling is out of scope and getting it wrong is worse
   * than not doing it.
   */
  async function fill(item: ItemSummary) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http")) {
      setNote("Cannot fill this kind of page.");
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
      // Autofill fails often; it has to fail into something useful. The copy
      // buttons are still right there.
      setNote("No login form on this page.");
    } catch (err) {
      if (err instanceof Error && /locked/i.test(err.message)) return onLocked();
      setNote("Could not fill this page.");
    }
  }

  async function changeLock(minutes: number) {
    setLockMinutes(minutes);
    await chrome.storage.local.set({ [LOCK_MINUTES_KEY]: minutes });
  }

  if (error) {
    return (
      <main className="pad">
        <h1>passio</h1>
        <p className="error">{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </main>
    );
  }

  if (!items) return <main className="pad muted">Decrypting…</main>;

  const canFill = tabUrl?.startsWith("http") ?? false;
  const showSite = forSite.length > 0 && query === "";
  const rest = showSite
    ? filtered.filter((i) => !forSite.some((m) => m.id === i.id))
    : filtered;

  return (
    <main>
      <div className="pad head">
        <h1>passio</h1>
        <button className="link" onClick={() => void vault.lock().then(onLocked)}>
          Lock
        </button>
      </div>

      <div className="pad tight">
        <input
          type="search" placeholder="Search vault" value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {damaged > 0 ? (
        <p className="pad tight warn">
          {damaged} item{damaged === 1 ? "" : "s"} could not be decrypted. The
          ciphertext is still in your vault — try the web app.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="pad tight muted">
          No items yet. <a href={OPEN_APP} target="_blank" rel="noreferrer">Add one</a>.
        </p>
      ) : null}

      {showSite ? (
        <>
          <p className="group">For this site</p>
          <ul className="list">
            {forSite.map((i) => (
              <Row
                key={i.id} item={i} canFill={canFill}
                onCopy={(f) => void copy(i, f)} onFill={() => void fill(i)}
              />
            ))}
          </ul>
        </>
      ) : null}

      {rest.length > 0 ? (
        <>
          {showSite ? <p className="group">All items</p> : null}
          <ul className="list">
            {rest.map((i) => (
              <Row
                key={i.id} item={i} canFill={canFill}
                onCopy={(f) => void copy(i, f)} onFill={() => void fill(i)}
              />
            ))}
          </ul>
        </>
      ) : query !== "" ? (
        <p className="pad tight muted">Nothing matches “{query}”.</p>
      ) : null}

      {note ? <p className="pad tight ok small">{note}</p> : null}

      <div className="pad foot">
        <label htmlFor="lock" className="inline">Lock after</label>
        <select
          id="lock" value={lockMinutes}
          onChange={(e) => void changeLock(Number(e.target.value))}
        >
          {LOCK_CHOICES.map((m) => (
            <option key={m} value={m}>{m} min</option>
          ))}
        </select>
      </div>
    </main>
  );
}

function App() {
  const [state, setState] = useState<VaultState | "loading">("loading");
  const [email, setEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setEmail(await readEmail());
    setState(await vault.status());
  }, []);

  useEffect(() => void refresh(), [refresh]);

  if (state === "loading") return <main className="pad muted">Checking…</main>;
  if (state === "unlocked") {
    return <Vault onLocked={() => setState("locked")} />;
  }
  return (
    <Unlock
      knownEmail={state === "locked" ? email : null}
      onDone={() => setState("unlocked")}
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
