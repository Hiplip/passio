"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ItemForm } from "~/components/vault/item-form";
import { useVault } from "~/hooks/use-vault";
import { encryptForStorage } from "~/hooks/use-vault-items";
import type { Item } from "@passio/core/schema";
import { api } from "~/trpc/react";

interface ItemEditorProps {
  itemId: string;
  initial: Item;
  /** Existing items can be deleted; a brand new one has nothing to delete yet. */
  isNew: boolean;
}

export function ItemEditor({ itemId, initial, isNew }: ItemEditorProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const { vaultKey } = useVault();

  const create = api.item.create.useMutation();
  const update = api.item.update.useMutation();
  const remove = api.item.delete.useMutation();

  const [item, setItem] = useState<Item>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!vaultKey) return;

    setSaving(true);
    setError(null);

    try {
      const ciphertext = await encryptForStorage(itemId, item, vaultKey);

      // Explicit, never optimistic: showing a password as saved when it was not
      // persisted is the worst failure this screen can have.
      if (isNew) {
        await create.mutateAsync({ id: itemId, ciphertext });
      } else {
        await update.mutateAsync({ id: itemId, ciphertext });
      }

      await utils.item.list.invalidate();
      router.push("/vault");
    } catch {
      setError("Could not save. Nothing was changed - check your connection and try again.");
      setSaving(false);
    }
  }

  async function destroy() {
    if (!window.confirm(`Delete “${item.title}”? You can restore it afterwards.`)) return;

    try {
      await remove.mutateAsync({ id: itemId });
      await utils.item.list.invalidate();
      router.push("/vault");
    } catch {
      setError("Could not delete this item.");
    }
  }

  return (
    <ItemForm
      value={item}
      onChange={setItem}
      onSave={() => void save()}
      onCancel={() => router.push("/vault")}
      onDelete={isNew ? undefined : () => void destroy()}
      saving={saving}
      error={error}
    />
  );
}
