"use client"

import * as React from "react"
import { cn } from "cn"

/** Same-width glyphs in the cipher face, so the band never reflows mid-sweep. */
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=?@" as const

const CELLS = 26
const TICK_MS = 55
/** How many cells the bright head spans. Wide enough to read as a sweep, short
 *  enough that the band stays mostly quiet. */
const HEAD = 7

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "#"
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * What key derivation looks like.
 *
 * Argon2id at 64 MiB takes about a second, and for that second the interface
 * used to say "Unlocking…" on a dead button - which reads as the application
 * having hung. That second is the most characteristic thing passio does: it is
 * where a password you typed becomes a key the server will never hold.
 *
 * So it is shown, in the cipher register, as a band of glyphs with a bright
 * head sweeping across it. Indeterminate on purpose - the work takes as long
 * as the device takes, and a bar that guessed a percentage would be lying.
 *
 * This is the only unprompted motion in the product. Under reduced motion the
 * band holds still and the label carries the whole message.
 */
export function CipherReadout({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  const [cells, setCells] = React.useState<string[]>(() =>
    Array.from({ length: CELLS }, randomGlyph)
  )
  const [head, setHead] = React.useState(0)
  const still = React.useMemo(prefersReducedMotion, [])

  React.useEffect(() => {
    if (still) return
    const timer = setInterval(() => {
      setHead((h) => (h + 1) % (CELLS + HEAD))
      setCells((current) => current.map((c) => (Math.random() < 0.5 ? randomGlyph() : c)))
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [still])

  return (
    <div className={cn("grid gap-2", className)}>
      <div
        aria-hidden
        className="secret text-cipher flex justify-between overflow-hidden text-[13px] leading-none"
      >
        {cells.map((glyph, i) => {
          // Distance from the head decides brightness, which is what turns a
          // row of random characters into a sweep rather than a flicker.
          const distance = head - i
          const lit = distance >= 0 && distance < HEAD
          return (
            <span
              key={i}
              style={{ opacity: still ? 0.3 : lit ? 1 - distance / HEAD : 0.18 }}
              className="transition-opacity duration-100"
            >
              {glyph}
            </span>
          )
        })}
      </div>

      {/* The band is decoration; this line is the actual status, and it is what
          a screen reader announces. */}
      <p role="status" className="text-muted-foreground text-center text-xs">
        {label}
      </p>
    </div>
  )
}
