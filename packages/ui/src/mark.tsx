import { cn } from "cn"

/**
 * One quarter of the dial's ring, from 52.5° to 127.5°.
 *
 * Four of these rotated by ninety degrees leave the four notches on the
 * diagonals. Written as an annular sector rather than a stroked circle with a
 * dash pattern, and with no mask or clip path anywhere: the mark has to survive
 * being injected as a raw string into a closed shadow root on someone else's
 * page, where an `id` could collide, and being rasterized to PNG by a tool that
 * handles paths far more reliably than it handles masks.
 *
 * Outer radius 46, inner 30. Angles are SVG's, so y grows downward and this
 * sector sits at the bottom of the circle.
 */
export const DIAL_SEGMENT =
  "M78 86.49A46 46 0 0 1 22 86.49L31.74 73.8A30 30 0 0 0 68.26 73.8Z"

export const DIAL_ROTATIONS = [0, 90, 180, 270] as const

/** The hub. Large enough to hold at 16px, where the ring is barely 2px. */
export const DIAL_HUB = 12

/**
 * The passio mark: a dial.
 *
 * Every competitor took a different lock — 1Password the keyhole, Bitwarden the
 * shield, Keeper and LastPass the padlock — and left the one that fits this
 * product best. The app calls itself a vault in its own source, and a dial says
 * strongroom rather than locker padlock.
 *
 * It is also a circle, which is the shape the whole interface is built from:
 * every item in the vault wears a disc carrying its own derived colour, and
 * this is the same disc with the product's own face on it.
 */
export function Mark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...props}
    >
      {DIAL_ROTATIONS.map((angle) => (
        <path key={angle} d={DIAL_SEGMENT} transform={`rotate(${angle} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r={DIAL_HUB} />
    </svg>
  )
}
