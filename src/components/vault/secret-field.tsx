"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { copyWithAutoClear } from "~/lib/clipboard";

interface SecretFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** A masked display string, e.g. a masked card number, shown while hidden. */
  maskedDisplay?: string;
  placeholder?: string;
}

/**
 * A field holding something secret: masked by default, revealed deliberately,
 * copied without ever needing to be shown.
 *
 * The copy toast names the 30 second auto-clear rather than just saying
 * "copied", so the clipboard emptying later is expected rather than a surprise.
 */
export function SecretField({
  label,
  value,
  onChange,
  maskedDisplay,
  placeholder,
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
      <Label htmlFor={id}>{label}</Label>

      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          value={revealed || !maskedDisplay ? value : maskedDisplay}
          readOnly={!revealed && !!maskedDisplay}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          autoComplete="off"
          className="secret"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-pressed={revealed}
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? <EyeOff /> : <Eye />}
          <span className="sr-only">{revealed ? `Hide ${label}` : `Show ${label}`}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={value.length === 0}
          onClick={() => void copy()}
        >
          {justCopied ? <Check className="text-primary" /> : <Copy />}
          <span className="sr-only">Copy {label}</span>
        </Button>
      </div>
    </div>
  );
}
