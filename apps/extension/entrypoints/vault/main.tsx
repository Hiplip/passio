import "@passio/ui/styles.css";

import { Button } from "@passio/ui/button";
import { Field } from "@passio/ui/field";
import { Toaster } from "@passio/ui/sonner";
import { VaultDataProvider } from "@passio/vault-ui/data";
import { EditItem } from "@passio/vault-ui/edit-item";
import { NavigationProvider } from "@passio/vault-ui/navigation";
import { NewItem } from "@passio/vault-ui/new-item";
import { VaultBrowser } from "@passio/vault-ui/vault-browser";
import { KeyRound, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { readEmail, writeEmail } from "../../src/chrome-storage";
import { vault } from "../../src/client";
import { useHashNavigation, usePath } from "../../src/hash-router";
import type { VaultState } from "../../src/messages";
import { useExtensionVaultData } from "../../src/vault-data";

function Chrome({ children, onLock }: { children: React.ReactNode; onLock?: () => void }) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-5">
          <a href="#/vault" className="flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md">
              <KeyRound className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">passio</span>
          </a>
          {onLock ? (
            <Button variant="outline" size="sm" onClick={onLock} className="ml-auto">
              <Lock />
              Lock
            </Button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8">{children}</main>
      <Toaster position="bottom-center" />
    </div>
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
    <Chrome>
      <form onSubmit={(e) => void submit(e)} className="mx-auto grid max-w-sm gap-4">
        <div>
          <h1>{knownEmail ? "Welcome back" : "Sign in"}</h1>
          <p className="text-muted-foreground text-sm">
            {knownEmail ?? "Your vault is encrypted on this device."}
          </p>
        </div>
        {knownEmail ? null : (
          <Field
            label="Email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <Field
          label="Master password" type="password" autoComplete="current-password"
          required autoFocus secret value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </Chrome>
  );
}

/** `/vault`, `/vault/new`, `/vault/{id}` — the same paths the web app uses. */
function Route({ path }: { path: string }) {
  if (path === "/vault/new") return <NewItem />;
  const match = /^\/vault\/([0-9a-f-]{36})$/i.exec(path);
  if (match) return <EditItem itemId={match[1]!} />;
  return <VaultBrowser />;
}

function Vault({ onLocked }: { onLocked: () => void }) {
  const navigation = useHashNavigation();
  const path = usePath();
  const { data, error, reload } = useExtensionVaultData(onLocked);

  if (error) {
    return (
      <Chrome onLock={() => void vault.lock().then(onLocked)}>
        <div className="grid max-w-sm gap-3">
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="outline" onClick={reload} className="justify-self-start">
            Try again
          </Button>
        </div>
      </Chrome>
    );
  }

  return (
    <NavigationProvider value={navigation}>
      <VaultDataProvider value={data}>
        <Chrome onLock={() => void vault.lock().then(onLocked)}>
          <Route path={path} />
        </Chrome>
      </VaultDataProvider>
    </NavigationProvider>
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

  if (state === "loading") {
    return (
      <Chrome>
        <p className="text-muted-foreground text-sm">Checking…</p>
      </Chrome>
    );
  }
  if (state === "unlocked") return <Vault onLocked={() => setState("locked")} />;
  return (
    <Unlock
      knownEmail={state === "locked" ? email : null}
      onDone={() => setState("unlocked")}
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
