"use client";

import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { ItemEditor } from "~/app/vault/item-editor";
import { newCardItem, newLoginItem, newNoteItem, type Item, type ItemType } from "~/lib/items/schema";

const CHOICES: Array<{ type: ItemType; label: string; describe: string }> = [
  { type: "login", label: "Login", describe: "A username, password and one-time code." },
  { type: "note", label: "Secure note", describe: "Free text, encrypted like everything else." },
  { type: "card", label: "Credit card", describe: "Card number, expiry and security code." },
];

function blank(type: ItemType): Item {
  if (type === "note") return newNoteItem();
  if (type === "card") return newCardItem();
  return newLoginItem();
}

export function NewItem() {
  const [type, setType] = useState<ItemType | null>(null);

  // Generated here, before encryption, because the id is the item's additional
  // authenticated data.
  const itemId = useMemo(() => crypto.randomUUID(), []);

  if (!type) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1>What are you saving?</h1>
        {CHOICES.map((choice) => (
          <button
            key={choice.type}
            type="button"
            onClick={() => setType(choice.type)}
            className="hairline flex flex-col items-start gap-1 py-4 text-left hover:bg-[var(--surface)]"
          >
            <span className="font-medium">{choice.label}</span>
            <span className="text-sm text-[var(--muted)]">{choice.describe}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto">New {CHOICES.find((c) => c.type === type)?.label.toLowerCase()}</h1>
        <Button variant="quiet" onClick={() => setType(null)}>
          Change type
        </Button>
      </div>
      <ItemEditor itemId={itemId} initial={blank(type)} isNew />
    </div>
  );
}
