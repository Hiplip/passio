import { redirect } from "next/navigation";

import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

export default async function VaultPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <VaultShell>
      <div className="flex flex-col gap-3">
        <h1>Your vault</h1>
        <p className="text-[var(--muted)]">
          Nothing saved yet. Items you add are encrypted on this device before
          they are stored.
        </p>
      </div>
    </VaultShell>
  );
}
