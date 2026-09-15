"use client";

import { ArrowLeftRight, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@passio/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@passio/ui/select";
import { SettingsGroup, SettingsRow } from "@passio/vault-ui/settings-list";
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
    <div className="grid gap-8">
      <SettingsGroup
        title="Security"
        description="Locking clears the key from memory. You stay signed in, but need your master password to unlock again."
      >
        <SettingsRow label="Lock when idle" hint="Counts from your last action here">
          <Select
            // Without `items`, Base UI renders the raw value - "15" instead of
            // "After 15 minutes".
            items={Object.fromEntries(
              LOCK_TIMEOUT_CHOICES.map((c) => [String(c), describeLockTimeout(c)]),
            )}
            value={String(minutes)}
            onValueChange={(v) => setMinutes(Number(v))}
          >
            <SelectTrigger id="lock-timeout" aria-label="Lock when idle" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCK_TIMEOUT_CHOICES.map((choice) => (
                <SelectItem key={choice} value={String(choice)}>
                  {describeLockTimeout(choice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Master password"
          hint="Changing it re-seals your vault key and issues a new recovery key"
        >
          <Button variant="outline" size="sm" render={<Link href="/settings/security" />}>
            <KeyRound />
            Change
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Health"
        description="Weak, reused and ageing passwords, found on this device without asking anyone."
      >
        <SettingsRow
          label="Vault health"
          hint="Plus an optional check against known breaches"
        >
          <Button variant="outline" size="sm" render={<Link href="/settings/health" />}>
            <ShieldCheck />
            Open
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Your data"
        description="Bringing a vault in from another manager, or taking yours out."
      >
        <SettingsRow
          label="Import and export"
          hint="Bitwarden, 1Password, LastPass, Chrome, Firefox and KeePass"
        >
          <Button variant="outline" size="sm" render={<Link href="/settings/data" />}>
            <ArrowLeftRight />
            Open
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Account"
        description="Your email cannot be changed: it is part of how your vault key is derived, so a new address would produce a different key."
      >
        <SettingsRow label="Signed in as">
          <span className="secret text-muted-foreground text-[13px]">{email}</span>
        </SettingsRow>

        <SettingsRow label="Sign out" hint="Ends this session and locks the vault">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void authClient.signOut().then(() => router.push("/login"));
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
