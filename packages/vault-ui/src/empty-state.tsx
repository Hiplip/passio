import { cn } from "@passio/ui/cn";

/**
 * What a list says when it has nothing in it.
 *
 * An empty screen is an invitation, so every one of these says what to do next
 * rather than only reporting an absence. The shape is deliberately plain - no
 * illustration, no oversized icon - because these appear most often mid-search,
 * where a big graphic between you and the next keystroke is an obstruction.
 */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid justify-items-center gap-1 px-6 py-14 text-center", className)}>
      <p className="font-medium">{title}</p>
      {hint ? (
        <p className="text-muted-foreground max-w-xs text-[13px] leading-relaxed text-balance">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
