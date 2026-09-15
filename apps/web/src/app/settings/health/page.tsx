import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@passio/ui/button";
import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

import { HealthPanel } from "./health-panel";

export default async function HealthPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <VaultShell>
      <div className="grid gap-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-1.5 rounded-full"
            render={<Link href="/settings" />}
          >
            <ArrowLeft />
            <span className="sr-only">Back to settings</span>
          </Button>
          <h1>Vault health</h1>
        </div>
        <HealthPanel />
      </div>
    </VaultShell>
  );
}
