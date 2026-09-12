import { redirect } from "next/navigation";

import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

import { ChangePasswordForm } from "./change-password-form";

export default async function SecuritySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <VaultShell>
      <div>
        <div className="mb-6">
          <h1>Change master password</h1>
        </div>
        <ChangePasswordForm email={session.user.email} />
      </div>
    </VaultShell>
  );
}
