"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
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

    // Backoff exists to stop a phone melting its CPU on a typo, not as a
    // security control: unlock is entirely local, so there is nothing to
    // rate-limit server-side.
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
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
      <div>
        <h1>Unlock your vault</h1>
        <p className="mt-2 text-[var(--muted)]">
          Signed in as {email}. Your vault is still locked.
        </p>
      </div>

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
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy || !password || keys.isPending}>
        {busy ? "Unlocking…" : "Unlock"}
      </Button>

      <button
        type="button"
        className="self-start text-sm text-[var(--muted)] underline"
        onClick={() => {
          void authClient.signOut().then(() => router.push("/login"));
        }}
      >
        Sign out instead
      </button>
    </form>
  );
}
