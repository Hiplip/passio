import { redirect } from "next/navigation";

import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

import { VaultBrowser } from "@passio/vault-ui/vault-browser";

export default async function VaultPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <VaultShell>
      <VaultBrowser />
    </VaultShell>
  );
}
