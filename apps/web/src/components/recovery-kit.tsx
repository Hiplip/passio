"use client";

import { Check, Copy, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@passio/ui/button";

interface RecoveryKitProps {
  recoveryKey: string;
  email: string;
}

/**
 * Shows the recovery key exactly once.
 *
 * Rendered large, grouped, and in the monospace face, because what people
 * actually do with this is copy it onto paper by hand.
 */
export function RecoveryKit({ recoveryKey, email }: RecoveryKitProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Recovery key copied");
    } catch {
      toast.error("Could not copy", { description: "Write it down instead." });
    }
  };

  const [, version, ...groups] = recoveryKey.split("-");

  return (
    <div className="grid gap-4">
      <div className="bg-cipher-soft grid gap-3 rounded-xl p-5 print:border print:border-black print:bg-white">
        <p className="text-muted-foreground text-xs print:text-black">
          Recovery key for {email}
        </p>

        <div className="secret text-cipher grid grid-cols-2 gap-x-4 gap-y-1.5 text-[15px] sm:grid-cols-4 print:text-black">
          <span className="text-muted-foreground col-span-2 sm:col-span-4 print:text-black">
            PASSIO-{version}
          </span>
          {groups.map((g, i) => (
            <span key={`${g}-${i}`}>{g}</span>
          ))}
        </div>

        <p className="text-muted-foreground text-xs print:text-black">
          Written {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => void copy()} type="button">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()} type="button">
          <Printer />
          Print
        </Button>
      </div>
    </div>
  );
}
