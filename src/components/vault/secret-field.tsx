"use client";

import { useId, useState } from "react";

import { copyWithAutoClear } from "~/lib/clipboard";

interface SecretFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** Renders a masked display string instead of dots, e.g. a masked card number. */
  maskedDisplay?: string;
  readOnly?: boolean;
  placeholder?: string;
}

/**
 * A field holding something secret: masked by default, revealed deliberately,
 * copied without ever being shown.
 *
 * Copy states the 30 second auto-clear rather than just saying "copied", so the
 * clipboard emptying later is expected behaviour rather than a surprise.
 */
export function SecretField({
  label,
  value,
  onChange,
  maskedDisplay,
  readOnly = false,
  placeholder,
}: SecretFieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function copy() {
    const ok = await copyWithAutoClear(value);
    setStatus(ok ? "Copied. Clipboard clears in 30 seconds." : "Could not copy.");
    setTimeout(() => setStatus(null), 4000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      <div className="flex items-stretch gap-2">
        {revealed || !maskedDisplay ? (
          <input
            id={id}
            type={revealed ? "text" : "password"}
            value={value}
            readOnly={readOnly}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            autoComplete="off"
            className="secret w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-base"
          />
        ) : (
          <output
            id={id}
            className="secret w-full rounded-[5px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-base"
          >
            {maskedDisplay}
          </output>
        )}

        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="rounded-[5px] border border-[var(--line)] px-3 text-sm hover:border-[var(--muted)]"
          aria-pressed={revealed}
        >
          {revealed ? "Hide" : "Show"}
        </button>

        <button
          type="button"
          onClick={() => void copy()}
          disabled={value.length === 0}
          className="rounded-[5px] border border-[var(--line)] px-3 text-sm hover:border-[var(--muted)] disabled:opacity-50"
        >
          Copy
        </button>
      </div>

      {status ? (
        <p role="status" className="text-sm text-[var(--muted)]">
          {status}
        </p>
      ) : null}
    </div>
  );
}
