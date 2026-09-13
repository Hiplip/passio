"use client";

import { ChevronRight, CreditCard, KeyRound, StickyNote } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ItemEditor } from "~/app/vault/item-editor";
import { Button } from "~/components/ui/button";
import {
  newCardItem,
  newLoginItem,
  newNoteItem,
  type Item,
  type ItemType,
} from "@passio/core/schema";

const CHOICES = [
  {
    type: "login" as const,
    label: "Login",
    describe: "A username, password and one-time codes.",
    Icon: KeyRound,
  },
  {
    type: "note" as const,
    label: "Secure note",
    describe: "Free text, encrypted like everything else.",
    Icon: StickyNote,
  },
  {
    type: "card" as const,
    label: "Credit card",
    describe: "Card number, expiry and security code.",
    Icon: CreditCard,
  },
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
      <div className="grid gap-6">
        <div>
          <h1>What are you saving?</h1>
          <p className="text-muted-foreground text-sm">
            Everything is encrypted before it leaves this device.
          </p>
        </div>

        <ul className="divide-border bg-card divide-y overflow-hidden rounded-xl border">
          {CHOICES.map(({ type: t, label, describe, Icon }) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => setType(t)}
                className="hover:bg-muted/60 flex w-full items-center gap-3 px-4 py-4 text-left transition-colors"
              >
                <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="text-muted-foreground block text-xs">{describe}</span>
                </span>
                <ChevronRight className="text-muted-foreground size-4" />
              </button>
            </li>
          ))}
        </ul>

        <Button variant="ghost" render={<Link href="/vault" />} className="justify-self-start">
          Cancel
        </Button>
      </div>
    );
  }

  const choice = CHOICES.find((c) => c.type === type);

  const Icon = choice?.Icon ?? KeyRound;

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate">New {choice?.label.toLowerCase()}</h1>
          <p className="text-muted-foreground text-sm">{choice?.describe}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setType(null)} className="ml-auto">
          Change type
        </Button>
      </div>

      <ItemEditor itemId={itemId} initial={blank(type)} isNew />
    </div>
  );
}
