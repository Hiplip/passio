import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { API_BASE, createApi } from "../../src/api";
import { chromeTokenStore, readToken, signIn, writeToken } from "../../src/auth";
import "./styles.css";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; error?: string }
  | { kind: "connected" };

function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const token = await readToken(chromeTokenStore);
      if (!token) {
        setState({ kind: "signed-out" });
        return;
      }
      try {
        // Phase 3 replaces this with a real unlock. For now it proves only that
        // a stored token still authenticates across origins.
        await createApi(token).vault.getKeys.query();
        setState({ kind: "connected" });
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
      setState({ kind: "connected" });
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

  if (state.kind === "loading") {
    return <main className="pad muted">Checking…</main>;
  }

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
      <form onSubmit={(e) => void onSubmit(e)}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Master password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {state.error ? <p className="error">{state.error}</p> : null}
        {/* Argon2id at 64 MiB takes about a second; a silent button reads as
            a broken one. */}
        <button type="submit" disabled={busy}>
          {busy ? "Deriving key…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
