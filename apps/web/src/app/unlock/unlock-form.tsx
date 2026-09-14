"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import { CipherReadout } from "@passio/ui/cipher-readout";
import { Field } from "@passio/ui/field";
import { useVault } from "~/hooks/use-vault";
import { attemptUnlock } from "~/lib/auth/unlock";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

const BACKOFF_AFTER = 5;
const BACKOFF_MS = 2000;

export function UnlockForm({ email }: { email: string }) {
  const router = useRouter();
  const { unlock } = useVault();
  const keys = api.vault.getKeys.useQuery();

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !keys.data) return;

    setBusy(true);
    setError(null);

    // Backoff stops a phone melting its CPU on a typo. Unlock is entirely
    // local, so there is nothing to rate-limit server-side.
    if (failures >= BACKOFF_AFTER) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS));
    }

    const result = await attemptUnlock(email, password, keys.data.protectedVaultKey);

    if (result.ok) {
      unlock(result.vaultKey);
      router.push("/vault");
      return;
    }

    setFailures((n) => n + 1);
    setError("That master password did not unlock the vault.");
    setPassword("");
    setBusy(false);
  }

  return (
    <div className="grid gap-7">
      <div className="grid gap-1.5">
        <h1>Welcome back</h1>
        <p className="text-muted-foreground">
          Signed in as <span className="text-foreground">{email}</span>
        </p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="grid gap-5">
        <Field
          label="Master password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          secret
          disabled={busy}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {/*
          The button becomes the readout rather than sitting beside one: there
          is exactly one thing happening, and two live elements would invite a
          second click on a form that is already working.
        */}
        {busy ? (
          <CipherReadout label="Deriving your key on this device…" className="py-1" />
        ) : (
          <Button
            type="submit"
            size="lg"
            disabled={!password || keys.isPending}
            className="w-full"
          >
            Unlock vault
          </Button>
        )}

        <button
          type="button"
          className="text-muted-foreground hover:text-foreground justify-self-center text-[13px] underline-offset-4 hover:underline"
          onClick={() => {
            void authClient.signOut().then(() => router.push("/login"));
          }}
        >
          Sign out instead
        </button>
      </form>
    </div>
  );
}
