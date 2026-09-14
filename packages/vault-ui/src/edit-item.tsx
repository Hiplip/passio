"use client";

import { ArrowLeft, CreditCard, KeyRound, StickyNote } from "lucide-react";

import { ItemEditor } from "./item-editor";
import { Alert, AlertDescription, AlertTitle } from "@passio/ui/alert";
import { Button } from "@passio/ui/button";
import { Skeleton } from "@passio/ui/skeleton";
import { useVaultData } from "./data";
import type { DecryptedItem } from "@passio/core/decrypt-vault";
import type { ItemType } from "@passio/core/schema";
import { routes, useNavigation } from "./navigation";
import { relativeTime } from "./relative-time";

const TYPE_META: Record<ItemType, { label: string; Icon: typeof KeyRound }> = {
  login: { label: "Login", Icon: KeyRound },
  note: { label: "Secure note", Icon: StickyNote },
  card: { label: "Card", Icon: CreditCard },
};

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

/** Title block: the type icon and last-changed line orient you at a glance. */
function ItemHeader({ item }: { item: DecryptedItem }) {
  const { label, Icon } = TYPE_META[item.data.type];

  return (
    <div className="flex items-center gap-3">
      <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <h1 className="truncate">{item.data.title}</h1>
        <p className="text-muted-foreground text-sm">
          {label} · Updated {relativeTime(item.updatedAt)}
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
