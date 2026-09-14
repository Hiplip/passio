import "@passio/ui/styles.css";

import { Button } from "@passio/ui/button";
import { Field } from "@passio/ui/field";
import { Toaster } from "@passio/ui/sonner";
import { VaultDataProvider } from "@passio/vault-ui/data";
import { EditItem } from "@passio/vault-ui/edit-item";
import { NavigationProvider } from "@passio/vault-ui/navigation";
import { NewItem } from "@passio/vault-ui/new-item";
import { VaultBrowser } from "@passio/vault-ui/vault-browser";
import { Wordmark } from "@passio/ui/wordmark";
import { CipherReadout } from "@passio/ui/cipher-readout";
import { Lock } from "lucide-react";
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
      <header className="bg-background sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-5">
          <a
            href="#/vault"
            className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
          >
            <Wordmark size="sm" />
          </a>
          {onLock ? (
            <Button variant="outline" size="sm" onClick={onLock} className="ml-auto">
              <Lock />
              Lock
            </Button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
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
      <form onSubmit={(e) => void submit(e)} className="mx-auto grid max-w-sm gap-5">
        <div className="grid gap-1">
          <h1>{knownEmail ? "Welcome back" : "Sign in"}</h1>
          <p className="text-muted-foreground text-[13px]">
            {knownEmail ?? "Your vault is encrypted on this device."}
          </p>
        </div>
        {knownEmail ? null : (
          <Field
            label="Email" type="email" autoComplete="username" required disabled={busy}
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <Field
          label="Master password" type="password" autoComplete="current-password"
          required autoFocus secret disabled={busy} value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
        />
        {busy ? (
          <CipherReadout label="Deriving your key on this device…" />
        ) : (
          <Button type="submit" size="lg">
            Unlock vault
          </Button>
        )}
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
  const path = usePath("/vault");
  const { data, error, reload } = useExtensionVaultData(onLocked);

  if (error) {
    return (
      <Chrome onLock={() => void vault.lock().then(onLocked)}>
        <div className="grid max-w-sm gap-1">
          <p className="font-medium">{error}</p>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Your vault is unharmed. This is usually a dropped connection.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            className="mt-3 justify-self-start"
          >
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
        <p className="text-muted-foreground text-[13px]">Checking your vault…</p>
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
