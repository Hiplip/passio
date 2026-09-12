"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { copyWithAutoClear } from "@passio/core/clipboard";
import {
  generateTotp,
  secondsRemaining,
  TOTP_DEFAULTS,
  type TotpConfig,
} from "@passio/core/totp";

/** Splits 123456 into "123 456" so it can be read back in two glances. */
function group(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

export function TotpDisplay({ config }: { config: TotpConfig }) {
  const period = config.period ?? TOTP_DEFAULTS.period;
  const [now, setNow] = useState(() => Date.now());
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  let code: string;
  try {
    code = generateTotp(config, now);
  } catch {
    return (
      <p className="text-destructive text-sm">
        This item&rsquo;s authenticator secret could not be read.
      </p>
    );
  }

  const remaining = secondsRemaining(period, now);
  const circumference = 2 * Math.PI * 9;
  const expiring = remaining <= 5;

  async function copy() {
    if (await copyWithAutoClear(code)) {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
      toast.success("One-time code copied", {
        description: "Your clipboard clears in 30 seconds.",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`One-time code ${code}, expires in ${remaining} seconds. Copy.`}
      className="bg-card hover:bg-muted/60 flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
    >
      <span className="secret text-primary flex-1 text-xl">{group(code)}</span>

      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="9" fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle
            cx="11"
            cy="11"
            r="9"
            fill="none"
            stroke={expiring ? "var(--destructive)" : "var(--primary)"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - remaining / period)}
            transform="rotate(-90 11 11)"
          />
        </svg>
        {/* The ring alone is not accessible; the number carries the same fact. */}
        <span className="secret w-6">{remaining}s</span>
      </span>

      {justCopied ? (
        <Check className="text-primary size-4" />
      ) : (
        <Copy className="text-muted-foreground size-4" />
      )}
    </button>
  );
}
