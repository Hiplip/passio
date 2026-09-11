import { type InputHTMLAttributes, forwardRef, useId } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Renders the value in the monospace face. Use for anything secret. */
  secret?: boolean;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, secret = false, className = "", ...props },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={[
          "w-full rounded-[5px] border bg-[var(--surface)] px-3 py-2.5 text-base",
          "placeholder:text-[var(--muted)]",
          secret ? "secret" : "",
          error ? "border-[var(--danger)]" : "border-[var(--line)]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
