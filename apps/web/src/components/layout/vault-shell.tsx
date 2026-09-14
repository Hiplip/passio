"use client";

import { Lock, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@passio/ui/button";
import { Wordmark } from "@passio/ui/wordmark";
import { VaultAdapter } from "~/components/vault-adapter";
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
      {/*
        A hairline, not a slab. The header used to be a translucent blurred bar
        that read as a separate plane floating over the page; sharing the page's
        own ground makes the whole thing one sheet, which is quieter and leaves
        the list as the only object on screen.
      */}
      <header className="bg-background sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-5">
          <Link
            href="/vault"
            className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
          >
            <Wordmark size="sm" />
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              render={<Link href="/settings" />}
            >
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

      {/*
        max-w-3xl, down from 4xl. The sidebar is gone, so the list has the full
        column - and a list of two-line rows reads worse the wider it gets,
        because the eye has to travel from a name on the left to an action on
        the right.
      */}
      <main className="mx-auto max-w-3xl px-5 py-8">
        <VaultAdapter>{children}</VaultAdapter>
      </main>
    </div>
  );
}
