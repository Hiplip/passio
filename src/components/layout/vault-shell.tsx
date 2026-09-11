"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "~/components/ui/button";
import { useAutoLock } from "~/hooks/use-auto-lock";
import { useLockTimeout } from "~/hooks/use-lock-timeout";
import { useVault } from "~/hooks/use-vault";

/**
 * The frame for every screen shown once the vault is open.
 *
 * Unlike AuthShell this carries no `vault-locked` class, so the accent colour
 * is present here and only here.
 */
export function VaultShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isUnlocked, lock } = useVault();
  const [lockTimeoutMinutes] = useLockTimeout();

  useAutoLock({
    timeoutMs: lockTimeoutMinutes * 60_000,
    isUnlocked,
    onLock: lock,
  });

  // The key lives in memory, so a reload lands here locked. Send the user to
  // unlock rather than rendering an empty vault that looks like data loss.
  useEffect(() => {
    if (!isUnlocked) router.replace("/unlock");
  }, [isUnlocked, router]);

  if (!isUnlocked) return null;

  return (
    <div className="min-h-screen">
      <header className="hairline sticky top-0 z-10 bg-[var(--paper)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3">
          <Link href="/vault" className="text-sm font-medium tracking-tight">
            passio
          </Link>

          <nav className="ml-auto flex items-center gap-4">
            <Link href="/settings" className="text-sm text-[var(--muted)] hover:underline">
              Settings
            </Link>
            <Button variant="quiet" onClick={lock} className="px-3 py-1.5 text-xs">
              Lock
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  );
}
