"use client";

import { KeyRound, Lock, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@passio/ui/button";
import { useAutoLock } from "~/hooks/use-auto-lock";
import { useLockTimeout } from "~/hooks/use-lock-timeout";
import { useVault } from "~/hooks/use-vault";

/** The frame for every screen shown once the vault is open. */
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
  // unlock rather than rendering an empty vault, which would look like data loss.
  useEffect(() => {
    if (!isUnlocked) router.replace("/unlock");
  }, [isUnlocked, router]);

  if (!isUnlocked) return null;

  return (
    <div className="min-h-screen">
      <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-5">
          <Link href="/vault" className="flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md">
              <KeyRound className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">passio</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" render={<Link href="/settings" />}>
              <Settings />
              <span className="sr-only">Settings</span>
            </Button>
            <Button variant="outline" size="sm" onClick={lock}>
              <Lock />
              Lock
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">{children}</main>
    </div>
  );
}
