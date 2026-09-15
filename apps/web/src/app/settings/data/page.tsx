import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@passio/ui/button";
import { VaultShell } from "~/components/layout/vault-shell";
import { getSession } from "~/server/better-auth/server";

import { DataForm } from "./data-form";

export default async function DataSettingsPage() {
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
          <h1>Import and export</h1>
        </div>
        <DataForm />
      </div>
    </VaultShell>
  );
}
