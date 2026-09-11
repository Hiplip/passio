"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { buildPasswordChangePayload } from "~/lib/auth/recovery";
import { api } from "~/trpc/react";

const MIN_MASTER_PASSWORD = 10;

export function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const keys = api.vault.getKeys.useQuery();
  const rewrap = api.vault.rewrap.useMutation();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_MASTER_PASSWORD &&
    next === confirm &&
    !busy &&
    keys.data !== undefined;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !keys.data) return;

    setBusy(true);
    setError(null);

    try {
      // Unwraps with the current password and re-wraps under the new one. The
      // vault key is unchanged, so no item is re-encrypted.
      const payload = await buildPasswordChangePayload({
        email,
        currentMasterPassword: current,
        protectedVaultKey: keys.data.protectedVaultKey,
        newMasterPassword: next,
      });

      await rewrap.mutateAsync(payload);
      setDone(true);
    } catch {
      setError("That current master password is not correct.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h2>Master password changed</h2>
        <p className="text-[var(--muted)]">
          Everything in your vault is unchanged. Other devices will need to sign
          in again. Your recovery key still works.
        </p>
        <Button className="self-start" onClick={() => router.push("/unlock")}>
          Unlock with my new password
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-xl flex-col gap-6">
      <p className="text-[var(--muted)]">
        Changing your master password re-encrypts only the key to your vault, so
        it is fast and nothing inside is touched.
      </p>

      <Field
        label="Current master password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        hint="Required even though you are signed in, so a stolen session alone cannot take over the account."
        required
      />

      <Field
        label="New master password"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={
          next.length > 0 && next.length < MIN_MASTER_PASSWORD
            ? `Use at least ${MIN_MASTER_PASSWORD} characters.`
            : undefined
        }
        required
      />

      <Field
        label="Confirm new master password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? "These do not match." : undefined}
        required
      />

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {busy ? "Re-wrapping your vault key…" : "Change master password"}
      </Button>
    </form>
  );
}
