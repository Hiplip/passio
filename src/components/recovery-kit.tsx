"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";

interface RecoveryKitProps {
  recoveryKey: string;
  email: string;
}

/**
 * Shows the recovery key exactly once.
 *
 * The key is rendered in the monospace face, grouped, and large enough to
 * transcribe by hand, because that is what people actually do with it. It is
 * never sent to the server and cannot be shown again.
 */
export function RecoveryKit({ recoveryKey, email }: RecoveryKitProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const groups = recoveryKey.split("-");
  const prefix = groups.slice(0, 2).join("-");
  const body = groups.slice(2);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[5px] border border-[var(--line)] bg-[var(--surface)] p-6 print:border-black">
        <p className="mb-4 text-sm text-[var(--muted)] print:text-black">
          Recovery key for {email}
        </p>

        <div className="secret flex flex-wrap gap-x-3 gap-y-2 text-lg leading-relaxed print:text-black">
          <span className="text-[var(--muted)] print:text-black">{prefix}</span>
          {body.map((group, i) => (
            <span key={`${group}-${i}`}>{group}</span>
          ))}
        </div>

        <p className="mt-4 text-sm text-[var(--muted)] print:text-black">
          Written {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Button variant="quiet" onClick={() => void copy()} type="button">
          {copied ? "Copied" : "Copy key"}
        </Button>
        <Button variant="quiet" onClick={() => window.print()} type="button">
          Print
        </Button>
      </div>
    </div>
  );
}
