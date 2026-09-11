import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "quiet" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-[5px] px-4 py-2.5 " +
  "text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  // The accent is neutralised by .vault-locked, so a primary button reads as
  // grey while the vault is locked and gains colour the moment it opens.
  primary:
    "bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90 " +
    "disabled:hover:opacity-50",
  quiet:
    "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] " +
    "hover:border-[var(--muted)]",
  // Reserved for irreversible actions only.
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className = "", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);
