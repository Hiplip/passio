import { redirect } from "next/navigation";

import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <VaultShell>
      <div>
        <div className="mb-6">
          <h1>Settings</h1>
          <p className="text-muted-foreground text-sm">
            How this vault behaves on this device.
          </p>
        </div>
        <SettingsForm email={session.user.email} />
      </div>
    </VaultShell>
  );
}
