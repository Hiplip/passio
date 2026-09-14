"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RecoveryKit } from "~/components/recovery-kit";
import { Alert, AlertDescription } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import { CipherReadout } from "@passio/ui/cipher-readout";
import { Field } from "@passio/ui/field";
import { buildRecoveryPayload } from "~/lib/auth/recovery";
import { api } from "~/trpc/react";

const MIN_MASTER_PASSWORD = 10;

export function RecoverForm() {
  const router = useRouter();
  const utils = api.useUtils();
  const recover = api.recovery.recover.useMutation();

  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    email.length > 0 &&
    recoveryKey.trim().length > 0 &&
    password.length >= MIN_MASTER_PASSWORD &&
    password === confirm &&
    !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);

    try {
      const { recoveryWrappedVaultKey } = await utils.recovery.getWrappedKey.fetch({
        email,
      });

      // Throws here, locally, if the recovery key is wrong - the decoy returned
      // for an unknown email fails at exactly the same point.
      const payload = await buildRecoveryPayload({
        email,
        recoveryDisplay: recoveryKey,
        recoveryWrappedVaultKey,
        newMasterPassword: password,
      });

      const { newRecoveryDisplay, ...body } = payload;
      await recover.mutateAsync(body);
      setNewRecoveryKey(newRecoveryDisplay);
    } catch {
      setError(
        "That email and recovery key do not match an account, or the recovery key is mistyped.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (newRecoveryKey) {
    return (
      <div className="grid gap-7">
        <div className="grid gap-1.5">
          <h1>Save your new recovery key</h1>
          <p className="text-muted-foreground">
            Your old recovery key no longer works. Everything in your vault is
            unchanged.
          </p>
        </div>

        <div className="grid gap-5">
          <RecoveryKit recoveryKey={newRecoveryKey} email={email} />

          <label className="flex items-start gap-3 text-sm print:hidden">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="accent-primary mt-0.5 size-4"
            />
            <span>I have saved this recovery key somewhere safe.</span>
          </label>

          <Button
            size="lg"
            disabled={!saved}
            onClick={() => router.push("/login")}
            className="w-full print:hidden"
          >
            Sign in with my new password
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-7">
      <div className="grid gap-1.5">
        <h1>Use your recovery key</h1>
        <p className="text-muted-foreground">
          This sets a new master password. Your vault contents are not affected.
        </p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="grid gap-5">

      <Field
        label="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <Field
        label="Recovery key"
        value={recoveryKey}
        onChange={(e) => setRecoveryKey(e.target.value)}
        placeholder="PASSIO-1-XXXXXX-XXXXXX-…"
        hint="Spacing and capitalisation do not matter."
        secret
        required
      />

      <Field
        label="New master password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={
          password.length > 0 && password.length < MIN_MASTER_PASSWORD
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
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {busy ? (
        <CipherReadout
          label="Unwrapping your vault key and sealing it again…"
          className="py-1"
        />
      ) : (
        <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
          Set a new master password
        </Button>
      )}
      </form>
    </div>
  );
}
