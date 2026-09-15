"use client";

import { HealthReportPanel } from "@passio/vault-ui/health-report";

/** A client boundary so the report, which reads the decrypted vault from
 *  context, is never rendered on the server. */
export function HealthPanel() {
  return <HealthReportPanel />;
}
