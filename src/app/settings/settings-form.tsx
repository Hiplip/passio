"use client";

import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import {
  describeLockTimeout,
  LOCK_TIMEOUT_CHOICES,
  useLockTimeout,
} from "~/hooks/use-lock-timeout";
import { authClient } from "~/server/better-auth/client";

export function SettingsForm({ email }: { email: string }) {
  const router = useRouter();
  const [minutes, setMinutes] = useLockTimeout();

  return (
    <div className="flex max-w-xl flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2>Lock the vault when idle</h2>
        <p className="text-[var(--muted)]">
          Locking clears the key from memory. You will need your master password
          to unlock again, but you stay signed in.
        </p>

        <div className="flex flex-col gap-2">
          {LOCK_TIMEOUT_CHOICES.map((choice) => (
            <label key={choice} className="flex items-center gap-3 text-sm">
              <input
                type="radio"
                name="lock-timeout"
                checked={minutes === choice}
                onChange={() => setMinutes(choice)}
              />
              <span>{describeLockTimeout(choice)}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Account</h2>
        <p className="text-[var(--muted)]">
          Signed in as <span className="secret">{email}</span>. Your email cannot
          be changed: it is part of how your vault key is derived.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="quiet" onClick={() => router.push("/settings/security")}>
            Change master password
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              void authClient.signOut().then(() => router.push("/login"));
            }}
          >
            Sign out
          </Button>
        </div>
      </section>
    </div>
  );
}
