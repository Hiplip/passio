import { redirect } from "next/navigation";

import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

import { NewItem } from "./new-item";

export default async function NewItemPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <VaultShell>
      <NewItem />
    </VaultShell>
  );
}
