import { type InputHTMLAttributes, forwardRef, useId } from "react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Renders the value in the monospace face. Use for anything secret. */
  secret?: boolean;
}

/**
 * A labelled input with room for a hint or an error.
 *
 * Hint and error occupy the same slot and the error wins, so a field never
 * shows advice and a correction at once - and the layout does not jump when
 * one replaces the other.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, secret = false, className, ...props },
  ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>

      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(secret && "secret", className)}
        {...props}
      />

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
