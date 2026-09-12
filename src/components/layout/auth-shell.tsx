import { KeyRound } from "lucide-react";

/**
 * The frame for every screen shown before the vault is open.
 *
 * A single centred column. An earlier version rendered these screens entirely
 * monochrome to dramatise the locked state - it read as unfinished rather than
 * intentional, so the whole interface now carries the same palette.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-5 py-12">
      {/* A single soft wash behind the card, so the page is not a flat slab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)] opacity-60"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg">
            <KeyRound className="size-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">passio</span>
        </div>

        {children}
      </div>
    </div>
  );
}
