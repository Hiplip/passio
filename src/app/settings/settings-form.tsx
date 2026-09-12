"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Auto-lock</CardTitle>
          <CardDescription>
            Locking clears the key from memory. You stay signed in, but need your
            master password to unlock again.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Label htmlFor="lock-timeout">Lock when idle</Label>
          <Select
            value={String(minutes)}
            onValueChange={(v) => setMinutes(Number(v))}
          >
            <SelectTrigger id="lock-timeout" className="w-full">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Signed in as <span className="secret">{email}</span>. Your email cannot be
            changed: it is part of how your vault key is derived.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/settings/security" />}>
            <KeyRound />
            Change master password
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void authClient.signOut().then(() => router.push("/login"));
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
