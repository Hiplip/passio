"use client";

import Link from "next/link";

import { ItemEditor } from "~/app/vault/item-editor";
import { useVault } from "~/hooks/use-vault";
import { useVaultItems } from "~/hooks/use-vault-items";

export function EditItem({ itemId }: { itemId: string }) {
  const { vaultKey } = useVault();
  const { items, damaged, isLoading } = useVaultItems(vaultKey);

  if (isLoading) {
    return <p className="text-[var(--muted)]">Decrypting…</p>;
  }

  if (damaged.includes(itemId)) {
    return (
      <div className="flex flex-col gap-3">
        <h1>This item could not be decrypted</h1>
        <p className="text-[var(--muted)]">
          It is still stored, so nothing has been lost. This usually means the
          stored data was altered.
        </p>
        <Link href="/vault" className="underline">
          Back to your vault
        </Link>
      </div>
    );
  }

  const item = items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return (
      <div className="flex flex-col gap-3">
        <h1>Item not found</h1>
        <p className="text-[var(--muted)]">
          It may have been deleted from another device.
        </p>
        <Link href="/vault" className="underline">
          Back to your vault
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1>{item.data.title}</h1>
      <ItemEditor itemId={item.id} initial={item.data} isNew={false} />
    </div>
  );
}
