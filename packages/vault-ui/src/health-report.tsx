"use client";

import { ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@passio/ui/button";
import { Switch } from "@passio/ui/switch";
import { cn } from "@passio/ui/cn";
import { analyseVault, healthScore } from "@passio/core/health";
import { sweepVault, type BreachSweep } from "@passio/core/breach";
import { useVaultData } from "./data";
import { ItemMark } from "./item-mark";
import { routes, useNavigation } from "./navigation";
import type { DecryptedItem } from "@passio/core/decrypt-vault";

/**
 * What is wrong with this vault, and what to do about it.
 *
 * Everything except the breach check runs on the already-decrypted vault with
 * no network at all. The breach check is opt-in and says exactly what leaves
 * the device, because it is the only outbound third-party request the product
 * makes.
 */
export function HealthReportPanel() {
  const { live } = useVaultData();
  const { Link } = useNavigation();

  const report = useMemo(
    () => analyseVault(live.items, new Date()),
    [live.items],
  );
  const score = healthScore(report);

  const [sweep, setSweep] = useState<BreachSweep | null>(null);
  const [checking, setChecking] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const passwordItems = useMemo(
    () => live.items.filter((item) => passwordOf(item) !== undefined),
    [live.items],
  );

  async function runSweep() {
    setChecking(true);
    try {
      const result = await sweepVault(
        passwordItems.map((item) => ({
          id: item.id,
          title: item.data.title,
          password: passwordOf(item) ?? "",
        })),
        (url) => fetch(url),
      );
      setSweep(result);
    } finally {
      setChecking(false);
    }
  }

  const clean =
    report.weak.length === 0 &&
    report.reused.length === 0 &&
    report.old.length === 0 &&
    report.unsecured.length === 0;

  return (
    <div className="grid gap-8">
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-full",
            score >= 80
              ? "bg-cipher-soft text-cipher"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {score >= 80 ? (
            <ShieldCheck className="size-6" />
          ) : (
            <ShieldAlert className="size-6" />
          )}
        </span>
        <div>
          <p className="secret text-2xl leading-none font-semibold">{score}</p>
          <p className="text-muted-foreground text-[13px]">
            {report.checked === 0
              ? "No passwords to check yet."
              : `across ${report.checked} ${report.checked === 1 ? "password" : "passwords"}`}
          </p>
        </div>
      </div>

      {clean && report.checked > 0 ? (
        <p className="text-muted-foreground text-[13px]">
          Nothing to fix. Every password is strong, distinct and recent.
        </p>
      ) : null}

      <Section
        title="Weak"
        hint="Short, predictable, or a common word wearing a hat."
        count={report.weak.length}
      >
        {report.weak.map((finding) => (
          <Row
            key={finding.id}
            id={finding.id}
            title={finding.title}
            detail={finding.notes[0] ?? finding.level}
            items={live.items}
            Link={Link}
          />
        ))}
      </Section>

      <Section
        title="Reused"
        hint="One breach on one site becomes a breach everywhere the same password went."
        count={report.reused.length}
      >
        {report.reused.map((group, i) => (
          <div key={i} className="py-3">
            <p className="text-muted-foreground mb-2 text-[12.5px]">
              {group.items.length} items share one password
            </p>
            <div className="grid gap-2">
              {group.items.map((entry) => (
                <Row
                  key={entry.id}
                  id={entry.id}
                  title={entry.title}
                  items={live.items}
                  Link={Link}
                />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Unchanged for a year or more"
        hint="Worth rotating, especially anywhere that has been in the news."
        count={report.old.length}
      >
        {report.old.map((finding) => (
          <Row
            key={finding.id}
            id={finding.id}
            title={finding.title}
            detail={`${Math.floor(finding.days / 365)} year${finding.days >= 730 ? "s" : ""} old`}
            items={live.items}
            Link={Link}
          />
        ))}
      </Section>

      <Section
        title="Sent over http"
        hint="These addresses are not encrypted in transit."
        count={report.unsecured.length}
      >
        {report.unsecured.map((finding, i) => (
          <Row
            key={`${finding.id}-${i}`}
            id={finding.id}
            title={finding.title}
            detail={finding.uri}
            items={live.items}
            Link={Link}
          />
        ))}
      </Section>

      <section className="grid gap-3 border-t pt-6">
        <div className="grid gap-1">
          <h2>Check against known breaches</h2>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            This is the only time passio contacts anyone else. It sends the first
            five characters of a password&rsquo;s SHA-1 hash to Have I Been Pwned and
            matches the rest here, on this device. Your passwords, your usernames and
            the sites they belong to never leave.
          </p>
        </div>

        <label className="flex items-center gap-3 text-[13px]">
          <Switch checked={allowed} onCheckedChange={setAllowed} />
          <span>Allow passio to contact Have I Been Pwned</span>
        </label>

        <Button
          size="sm"
          className="justify-self-start"
          disabled={!allowed || checking || passwordItems.length === 0}
          onClick={() => void runSweep()}
        >
          <Unlock />
          {checking ? "Checking…" : "Check now"}
        </Button>

        {sweep ? (
          <div className="grid gap-3 pt-2">
            {sweep.breached.length === 0 ? (
              <p className="text-[13px]">
                None of your passwords appeared in a known breach.
              </p>
            ) : (
              <div className="grid gap-2">
                <p className="text-destructive text-[13px] font-medium">
                  {sweep.breached.length} found in a known breach. Change these first.
                </p>
                {sweep.breached.map((finding) => (
                  <Row
                    key={finding.id}
                    id={finding.id}
                    title={finding.title}
                    detail={`seen ${finding.count.toLocaleString()} times`}
                    items={live.items}
                    Link={Link}
                  />
                ))}
              </div>
            )}

            {sweep.unknown.length > 0 ? (
              <p className="text-muted-foreground text-[12.5px]">
                {sweep.unknown.length} could not be checked and are not counted either
                way — {sweep.unknown[0]?.reason}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function passwordOf(item: DecryptedItem): string | undefined {
  const data = item.data;
  switch (data.type) {
    case "login":
    case "server":
    case "database":
    case "emailAccount":
      return data.password && data.password.length > 0 ? data.password : undefined;
    default:
      return undefined;
  }
}

function Section({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <div className="flex items-baseline gap-2">
          <h2>{title}</h2>
          <span className="secret text-muted-foreground text-[12px]">{count}</span>
        </div>
        <p className="text-muted-foreground text-[13px]">{hint}</p>
      </div>
      <div className="rows border-border border-y">{children}</div>
    </section>
  );
}

function Row({
  id,
  title,
  detail,
  items,
  Link,
}: {
  id: string;
  title: string;
  detail?: string;
  items: DecryptedItem[];
  Link: ReturnType<typeof useNavigation>["Link"];
}) {
  const item = items.find((i) => i.id === id);

  return (
    <Link
      href={routes.item(id)}
      className="hover:bg-muted/50 flex items-center gap-3 rounded-md py-2.5 pl-2 transition-colors"
    >
      <ItemMark name={title} type={item?.data.type ?? "login"} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        {detail ? (
          <span className="text-muted-foreground block truncate text-[12px]">{detail}</span>
        ) : null}
      </span>
    </Link>
  );
}
