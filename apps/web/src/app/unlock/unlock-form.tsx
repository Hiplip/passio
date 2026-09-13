"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
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
    <Card>
      <CardHeader>
        <div className="bg-muted text-muted-foreground mb-1 grid size-9 place-items-center rounded-lg">
          <Lock className="size-4" />
        </div>
        <CardTitle>Your vault is locked</CardTitle>
        <CardDescription>Signed in as {email}</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="grid gap-5">
          <Field
            label="Master password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            disabled={busy || !password || keys.isPending}
            className="w-full"
          >
            {busy ? "Unlocking…" : "Unlock"}
          </Button>

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground justify-self-center text-sm underline-offset-4 hover:underline"
            onClick={() => {
              void authClient.signOut().then(() => router.push("/login"));
            }}
          >
            Sign out instead
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
