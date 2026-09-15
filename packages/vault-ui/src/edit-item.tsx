"use client";

import { ArrowLeft } from "lucide-react";

import { ItemEditor } from "./item-editor";
import { ItemMark } from "./item-mark";
import { Alert, AlertDescription, AlertTitle } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import { Skeleton } from "@passio/ui/skeleton";
import { useVaultData } from "./data";
import type { DecryptedItem } from "@passio/core/decrypt-vault";
import { TYPE_SPECS } from "@passio/core/fields";
import { routes, useNavigation } from "./navigation";
import { relativeTime } from "./relative-time";


function BackToVault() {
  const { Link } = useNavigation();

  return (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href={routes.vault} />}
      className="text-muted-foreground -ml-2 justify-self-start"
    >
      <ArrowLeft />
      Back to your vault
    </Button>
  );
}

/**
 * Title block.
 *
 * Carries the same mark the row in the list carried, so opening an item is
 * visibly the same object continuing rather than a new screen appearing.
 */
function ItemHeader({ item }: { item: DecryptedItem }) {
  const { label } = TYPE_SPECS[item.data.type];

  return (
    <div className="flex items-center gap-3.5">
      <ItemMark name={item.data.title} type={item.data.type} size="lg" />
      <div className="min-w-0">
        <h1 className="truncate">{item.data.title}</h1>
        <p className="text-muted-foreground text-[13px]">
          {label}, updated {relativeTime(item.updatedAt)}
        </p>
      </div>
    </div>
  );
}

export function EditItem({ itemId }: { itemId: string }) {
  const { live } = useVaultData();
  const { items, damaged, isLoading } = live;

  if (isLoading) {
    return (
      <div className="grid gap-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (damaged.includes(itemId)) {
    return (
      <div className="grid gap-4">
        <BackToVault />
        <Alert variant="destructive">
          <AlertTitle>This item could not be decrypted</AlertTitle>
          <AlertDescription>
            It is still stored, so nothing has been lost. This usually means the
            stored data was altered.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const item = items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return (
      <div className="grid gap-4">
        <BackToVault />
        <div>
          <h1>Item not found</h1>
          <p className="text-muted-foreground text-sm">
            It may have been deleted from another device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <BackToVault />
      <ItemHeader item={item} />
      <ItemEditor itemId={item.id} initial={item.data} isNew={false} />
    </div>
  );
}
