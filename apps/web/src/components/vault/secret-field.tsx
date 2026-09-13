"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { copyWithAutoClear } from "@passio/core/clipboard";

interface SecretFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** A masked display string, e.g. a masked card number, shown while hidden. */
  maskedDisplay?: string;
  placeholder?: string;
  /** Rendered opposite the label, for things like "Generate". */
  action?: React.ReactNode;
}

/**
 * A field holding something secret: masked by default, revealed deliberately,
 * copied without ever needing to be shown.
 *
 * Reveal and copy sit inside the field rather than beside it. As siblings they
 * shortened the input, so secret fields no longer lined up with every other
 * field on the form.
 */
export function SecretField({
  label,
  value,
  onChange,
  maskedDisplay,
  placeholder,
  action,
}: SecretFieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  async function copy() {
    if (await copyWithAutoClear(value)) {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
      toast.success(`${label} copied`, {
        description: "Your clipboard clears in 30 seconds.",
      });
    } else {
      toast.error("Could not copy", {
        description: "Your browser blocked clipboard access.",
      });
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>

      <div className="relative">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          value={revealed || !maskedDisplay ? value : maskedDisplay}
          readOnly={!revealed && !!maskedDisplay}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          autoComplete="off"
          className="secret pr-18"
        />

        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={revealed}
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOff /> : <Eye />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy ${label}`}
            disabled={value.length === 0}
            onClick={() => void copy()}
          >
            {justCopied ? <Check className="text-primary" /> : <Copy />}
          </Button>
        </div>
      </div>
    </div>
  );
}
