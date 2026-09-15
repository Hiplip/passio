import { markIndex, monogram } from "@passio/core/identity";
import type { ItemType } from "@passio/core/schema";
import { cn } from "@passio/ui/cn";
import { TYPE_ICONS } from "./item-icons";

const SIZES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-[13px]",
  lg: "size-11 text-base",
} as const;

const GLYPH_SIZE = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

interface ItemMarkProps {
  /** The item's title. Both the colour and the letters come from it. */
  name: string;
  type: ItemType;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * An item's mark: a disc carrying its identity.
 *
 * A disc, and never the rounded square every other vault uses - that shape is
 * a favicon slot, and passio has no favicons to put in one (see
 * @passio/core/identity for why it must not fetch them).
 *
 * Logins get a monogram, because a login has a name a person recognises.
 * Notes and cards get their type glyph instead: they have no brand, and a "S"
 * standing for "Shopping list" would be pretending they do. Both are tinted by
 * the same derived hue, so a vault reads as one palette.
 */
export function ItemMark({ name, type, size = "md", className }: ItemMarkProps) {
  const index = markIndex(name);
  const Glyph = TYPE_ICONS[type];

  return (
    <span
      aria-hidden
      // Inline, because the hue is computed at runtime and a class name built
      // from a variable is exactly what Tailwind's purge cannot see.
      style={{
        color: `var(--mark-${index}-fg)`,
        backgroundColor: `var(--mark-${index}-bg)`,
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold select-none",
        SIZES[size],
        className,
      )}
    >
      {type === "login" ? (
        <span className="translate-y-px tracking-tight">{monogram(name)}</span>
      ) : (
        <Glyph className={GLYPH_SIZE[size]} strokeWidth={2.25} />
      )}
    </span>
  );
}
