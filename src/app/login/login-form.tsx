"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { normalizeEmail } from "~/lib/crypto";
import { deriveInWorker } from "~/lib/crypto-worker/client";
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
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Your master password is used on this device only.
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={busy || !email || !password} className="w-full">
            {busy ? "Checking…" : "Sign in"}
          </Button>

          <Link
            href="/recover"
            className="text-muted-foreground hover:text-foreground justify-self-center text-sm underline-offset-4 hover:underline"
          >
            Forgotten your master password?
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
