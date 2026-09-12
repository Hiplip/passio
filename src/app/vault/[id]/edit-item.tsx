"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ItemEditor } from "~/app/vault/item-editor";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useVault } from "~/hooks/use-vault";
import { useVaultItems } from "~/hooks/use-vault-items";

function BackToVault() {
  return (
    <Button variant="ghost" size="sm" render={<Link href="/vault" />} className="justify-self-start">
      <ArrowLeft />
      Back to your vault
    </Button>
  );
}

export function EditItem({ itemId }: { itemId: string }) {
  const { vaultKey } = useVault();
  const { items, damaged, isLoading } = useVaultItems(vaultKey);

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (damaged.includes(itemId)) {
    return (
      <div className="grid gap-4">
        <Alert variant="destructive">
          <AlertTitle>This item could not be decrypted</AlertTitle>
          <AlertDescription>
            It is still stored, so nothing has been lost. This usually means the
            stored data was altered.
          </AlertDescription>
        </Alert>
        <BackToVault />
      </div>
    );
  }

  const item = items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return (
      <div className="grid gap-4">
        <div>
          <h1>Item not found</h1>
          <p className="text-muted-foreground text-sm">
            It may have been deleted from another device.
          </p>
        </div>
        <BackToVault />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <BackToVault />
        <h1>{item.data.title}</h1>
      </div>
      <ItemEditor itemId={item.id} initial={item.data} isNew={false} />
    </div>
  );
}
