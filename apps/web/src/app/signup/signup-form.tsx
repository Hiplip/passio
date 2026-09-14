"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RecoveryKit } from "~/components/recovery-kit";
import { Alert, AlertDescription, AlertTitle } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@passio/ui/card";
import { Field } from "@passio/ui/field";
import { buildSignupPayload } from "~/lib/auth/signup-payload";
import { authClient } from "~/server/better-auth/client";

const MIN_MASTER_PASSWORD = 10;

/**
 * The recovery key is held in component state between the two steps rather than
 * passed through a route. A query string would put it in browser history and
 * server logs.
 */
export function SignupForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < MIN_MASTER_PASSWORD;
  const canSubmit =
    email.length > 0 &&
    password.length >= MIN_MASTER_PASSWORD &&
    password === confirm &&
    understood &&
    !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);

    try {
      const payload = await buildSignupPayload(email, password);
      const { recoveryDisplay, ...body } = payload;

      const result = await authClient.signUp.email({
        ...body,
        name: body.email.split("@")[0] ?? "owner",
      });

      if (result.error) {
        setError(
          result.error.status === 403
            ? "This vault already has an owner. Registration is closed."
            : (result.error.message ?? "Could not create the account."),
        );
        return;
      }

      setRecoveryKey(recoveryDisplay);
    } catch {
      setError("Could not create the account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Save your recovery key</CardTitle>
          <CardDescription>
            This is the only way back in if you forget your master password. It is
            shown once and cannot be shown again.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5">
          <RecoveryKit recoveryKey={recoveryKey} email={email} />

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
            disabled={!saved}
            onClick={() => router.push("/vault")}
            className="w-full print:hidden"
          >
            Open my vault
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your vault</CardTitle>
        <CardDescription>
          Your master password never leaves this device. It unlocks everything.
        </CardDescription>
      </CardHeader>

      <CardContent>
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
            label="Master password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={tooShort ? `Use at least ${MIN_MASTER_PASSWORD} characters.` : undefined}
            hint="Long and memorable beats short and complicated."
            required
          />

          <Field
            label="Confirm master password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatch ? "These do not match." : undefined}
            required
          />

          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>There is no password reset</AlertTitle>
            <AlertDescription>
              <p>
                Your vault is encrypted on this device, so nobody, including this
                server, can unlock it for you. Forget your master password and lose
                your recovery key, and everything in the vault is gone permanently.
              </p>
              <label className="mt-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="accent-destructive mt-0.5 size-4"
                />
                <span>I understand my vault cannot be recovered without these.</span>
              </label>
            </AlertDescription>
          </Alert>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {busy ? "Encrypting your vault…" : "Create vault"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
