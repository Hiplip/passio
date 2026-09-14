import { CreditCard, KeyRound, StickyNote } from "lucide-react";

import type { ItemSummary } from "./messages";

const GLYPHS = {
  login: KeyRound,
  note: StickyNote,
  card: CreditCard,
} as const;

/**
 * A type marker for a row.
 *
 * Without it a list of items is three near-identical blocks of text, and
 * scanning for the right one means reading every title.
 */
export function ItemGlyph({ type }: { type: ItemSummary["type"] }) {
  const Icon = GLYPHS[type];
  return (
    <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
      <Icon className="size-4" />
    </span>
  );
}
