import { redirect } from "next/navigation";

import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

import { EditItem } from "@passio/vault-ui/edit-item";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  return (
    <VaultShell>
      <EditItem itemId={id} />
    </VaultShell>
  );
}
