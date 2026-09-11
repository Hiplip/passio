"use client";

import { useEffect, useState } from "react";

import { copyWithAutoClear } from "~/lib/clipboard";
import {
  generateTotp,
  secondsRemaining,
  TOTP_DEFAULTS,
  type TotpConfig,
} from "~/lib/items/totp";

/** Splits 123456 into "123 456" so it can be read back in two glances. */
function group(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

export function TotpDisplay({ config }: { config: TotpConfig }) {
  const period = config.period ?? TOTP_DEFAULTS.period;

  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  let code: string;
  try {
    code = generateTotp(config, now);
  } catch {
    return (
      <p className="text-sm text-[var(--danger)]">
        This item&rsquo;s authenticator secret could not be read.
      </p>
    );
  }

  const remaining = secondsRemaining(period, now);
  const fraction = remaining / period;

  // Circumference of an r=9 circle, so stroke-dashoffset can sweep it.
  const circumference = 2 * Math.PI * 9;

  async function copy() {
    setCopied(await copyWithAutoClear(code));
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void copy()}
        className="secret rounded-[5px] px-2 py-1 text-lg text-[var(--accent)] hover:bg-[var(--line)]"
        aria-label={`Authenticator code ${code}, expires in ${remaining} seconds. Copy.`}
      >
        {group(code)}
      </button>

      <span className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle
            cx="11"
            cy="11"
            r="9"
            fill="none"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <circle
            cx="11"
            cy="11"
            r="9"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            transform="rotate(-90 11 11)"
          />
        </svg>
        {/* The ring alone is not accessible; the number carries the same fact. */}
        <span className="secret tabular-nums">{remaining}s</span>
      </span>

      {copied ? (
        <span role="status" className="text-sm text-[var(--muted)]">
          Copied, clears in 30s
        </span>
      ) : null}
    </div>
  );
}
