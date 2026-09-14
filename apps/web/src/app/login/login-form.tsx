"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import { CipherReadout } from "@passio/ui/cipher-readout";
import { Field } from "@passio/ui/field";
import { normalizeEmail } from "@passio/crypto";
import { deriveInWorker } from "@passio/crypto/worker/client";
import { authClient } from "~/server/better-auth/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const normalized = normalizeEmail(email);
      const { authHash } = await deriveInWorker(password, normalized);
      const result = await authClient.signIn.email({
        email: normalized,
        password: authHash,
      });

      if (result.error) {
        // Deliberately identical for an unknown email and a wrong password:
        // distinguishing them would confirm which accounts exist.
        setError("That email and master password do not match.");
        return;
      }

      router.push("/unlock");
    } catch {
      setError("Could not sign in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-7">
      <div className="grid gap-1.5">
        <h1>Welcome back</h1>
        <p className="text-muted-foreground">
          Your master password is used on this device only.
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
          disabled={busy}
        />

        <Field
          label="Master password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          secret
          disabled={busy}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {/* Signing in derives the same key unlocking does, and takes just as
            long, so it says the same thing while it works. */}
        {busy ? (
          <CipherReadout label="Deriving your key on this device…" className="py-1" />
        ) : (
          <Button
            type="submit"
            size="lg"
            disabled={!email || !password}
            className="w-full"
          >
            Sign in
          </Button>
        )}

        <Link
          href="/recover"
          className="text-muted-foreground hover:text-foreground justify-self-center text-[13px] underline-offset-4 hover:underline"
        >
          Forgotten your master password?
        </Link>
      </form>
    </div>
  );
}
