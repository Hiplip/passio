"use client";

import { useState } from "react";

import type { Item } from "@passio/core/schema";
import { useVaultData } from "./data";
import { ItemForm } from "./item-form";
import { routes, useNavigation } from "./navigation";

interface ItemEditorProps {
  itemId: string;
  initial: Item;
  /** Existing items can be deleted; a brand new one has nothing to delete yet. */
  isNew: boolean;
}

export function ItemEditor({ itemId, initial, isNew }: ItemEditorProps) {
  const { navigate } = useNavigation();
  const { createItem, updateItem, deleteItem } = useVaultData();

  const [item, setItem] = useState<Item>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);

    try {
      // Explicit, never optimistic: showing a password as saved when it was not
      // persisted is the worst failure this screen can have.
      if (isNew) {
        await createItem(itemId, item);
      } else {
        await updateItem(itemId, item);
      }

      navigate(routes.vault);
    } catch {
      setError("Could not save. Nothing was changed - check your connection and try again.");
      setSaving(false);
    }
  }

  async function destroy() {
    if (!window.confirm(`Delete “${item.title}”? You can restore it afterwards.`)) return;

    try {
      await deleteItem(itemId);
      navigate(routes.vault);
    } catch {
      setError("Could not delete this item.");
    }
  }

  return (
    <ItemForm
      value={item}
      onChange={setItem}
      onSave={() => void save()}
      onCancel={() => navigate(routes.vault)}
      onDelete={isNew ? undefined : () => void destroy()}
      saving={saving}
      error={error}
    />
  );
}
