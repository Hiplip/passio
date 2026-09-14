import { cn } from "cn"

const SIZES = {
  sm: { mark: "size-6 text-[13px]", text: "text-[13px]" },
  md: { mark: "size-7 text-[15px]", text: "text-[15px]" },
  lg: { mark: "size-9 text-lg", text: "text-lg" },
} as const

/**
 * passio, marking itself the way it marks your items.
 *
 * Every item in the vault wears a disc carrying a letter derived from its own
 * name. The product wears the same disc - inverted, ink on porcelain rather
 * than a tint, which is the one thing that says this mark is the application
 * and not something you saved.
 *
 * The letter is set in the cipher face, because that face is the one idea the
 * whole interface is built around.
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
      <span
        aria-hidden
        className={cn(
          "secret bg-foreground text-background grid shrink-0 place-items-center rounded-full leading-none font-medium",
          s.mark
        )}
      >
        p
      </span>
      {showName ? (
        <span className={cn("wordmark", s.text)}>passio</span>
      ) : (
        <span className="sr-only">passio</span>
      )}
    </span>
  )
}
