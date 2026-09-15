import { cn } from "cn"

import { Mark } from "./mark"

const SIZES = {
  sm: { mark: "size-6", text: "text-[13px]" },
  md: { mark: "size-7", text: "text-[15px]" },
  lg: { mark: "size-9", text: "text-lg" },
} as const

/**
 * passio, as a mark and a name.
 *
 * The dial is drawn in the foreground colour on nothing, rather than reversed
 * out of a filled disc. A ring already reads as an object; putting it inside a
 * second circle gave two concentric rings and a muddle at small sizes.
 */
export function Wordmark({
  size = "md",
  showName = true,
  className,
}: {
  size?: keyof typeof SIZES
  showName?: boolean
  className?: string
}) {
  const s = SIZES[size]

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Mark className={cn("text-foreground", s.mark)} />
      {showName ? (
        <span className={cn("wordmark", s.text)}>passio</span>
      ) : (
        <span className="sr-only">passio</span>
      )}
    </span>
  )
}
