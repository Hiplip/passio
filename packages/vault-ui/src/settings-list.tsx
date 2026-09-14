import { cn } from "@passio/ui/cn";

/**
 * A group of settings under one heading.
 *
 * The heading is sentence case at reading size, not a tracked-out all-caps
 * eyebrow. It is a label for what follows, and labels are for reading.
 */
export function SettingsGroup({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-3", className)}>
      <div className="grid gap-0.5">
        <h2>{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="rows border-border border-y">{children}</div>
    </section>
  );
}

/**
 * One setting: what it does on the left, the control that changes it on the
 * right.
 *
 * The same hairline row the vault list uses, so settings read as part of the
 * same product rather than a form bolted onto the side of it. Shared by the
 * web app and the extension, because a setting that looked different in each
 * would suggest it did something different in each.
 */
export function SettingsRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-4 py-3", className)}>
      <div className="min-w-0 flex-1">
        <p className="leading-tight">{label}</p>
        {hint ? (
          <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-snug">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
