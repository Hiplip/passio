"use client";

import * as React from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DEFAULT_GENERATOR_OPTIONS, generatePassword } from "@passio/core/generator";
import { Button } from "@passio/ui/button";
import { cn } from "@passio/ui/cn";

/**
 * The generator, running the code that ships.
 *
 * Not a facsimile: this imports `generatePassword` from @passio/core, the same
 * function the vault and the extension call, drawing from
 * `crypto.getRandomValues` with the biased tail of the range rejected rather
 * than folded in. Someone can use the real thing before deciding whether to
 * trust us with anything - which is a stronger argument than a screenshot of
 * it.
 *
 * Nothing here is sent anywhere. There is no endpoint to send it to.
 */

const LENGTHS = [16, 20, 32] as const;

/** Same width as a generated password, so the readout never resizes on mount. */
function placeholder(length: number): string {
  return "·".repeat(length);
}

export function TryGenerator() {
  const [length, setLength] = React.useState<number>(DEFAULT_GENERATOR_OPTIONS.length);
  const [password, setPassword] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const regenerate = React.useCallback((next: number) => {
    setPassword(generatePassword({ ...DEFAULT_GENERATOR_OPTIONS, length: next }));
    setCopied(false);
  }, []);

  // First value is generated after mount: getRandomValues would produce a
  // different string on the server than in the browser, and React would
  // discard the markup. `regenerate` is stable, so this runs once.
  React.useEffect(() => {
    regenerate(DEFAULT_GENERATOR_OPTIONS.length);
  }, [regenerate]);

  function choose(next: number) {
    setLength(next);
    regenerate(next);
  }

  function copy() {
    if (!password) return;
    navigator.clipboard
      .writeText(password)
      .then(() => {
        setCopied(true);
        toast.success("Copied. It never left this device.");
      })
      .catch(() => {
        toast.error("Your browser would not let the page copy that.");
      });
  }

  return (
    <div className="border-border bg-card rounded-xl border p-4 sm:p-5">
      <p
        aria-live="polite"
        className="secret text-cipher min-h-[3.5rem] text-lg leading-relaxed break-all sm:text-xl"
      >
        {password ?? placeholder(length)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Password length"
          className="border-border flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          {LENGTHS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              aria-pressed={length === option}
              className={cn(
                "secret cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors",
                length === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <Button variant="outline" onClick={() => regenerate(length)}>
          <RefreshCw data-icon="inline-start" />
          Generate another
        </Button>

        <Button variant="ghost" onClick={copy} disabled={!password}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
