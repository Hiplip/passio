/**
 * Checking a password against known breaches, without telling anyone what it is.
 *
 * Have I Been Pwned's range API takes the first five hex characters of a
 * password's SHA-1 and returns every suffix it holds under that prefix. The
 * match happens locally. HIBP learns that somebody asked about one of roughly
 * 850 buckets, which is not usable information about anyone.
 *
 * This is nonetheless the FIRST outbound third-party request this product has
 * ever made, and the original design spec listed "any outbound third-party API
 * call" as a non-goal. So it is off by default, the setting says exactly what
 * leaves the device, and this module never fires on its own - a caller has to
 * ask.
 *
 * The fetcher is injected, which is what makes the whole thing testable on a
 * machine with no network, including the failure paths that matter most.
 */

export const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

/**
 * What we know about a password.
 *
 * `unknown` is a real answer and the only honest one when the check could not
 * run. Reporting "safe" because a request failed would be worse than not
 * checking at all: it would tell someone their breached password is fine.
 */
export type BreachStatus =
  | { kind: "safe" }
  | { kind: "breached"; count: number }
  | { kind: "unknown"; reason: string };

export type Fetcher = (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;

async function sha1Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Whether one password appears in a known breach.
 *
 * Only the first five characters of the hash are sent. The full hash never
 * leaves this function, and the password never leaves the caller.
 */
export async function checkPassword(
  password: string,
  fetcher: Fetcher,
): Promise<BreachStatus> {
  if (password.length === 0) return { kind: "safe" };

  let hash: string;
  try {
    hash = await sha1Hex(password);
  } catch {
    return { kind: "unknown", reason: "This browser cannot compute the hash." };
  }

  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let body: string;
  try {
    const response = await fetcher(`${HIBP_RANGE_URL}${prefix}`);
    if (!response.ok) {
      return { kind: "unknown", reason: "The breach service did not answer." };
    }
    body = await response.text();
  } catch {
    // Offline, blocked, rate-limited. All of them mean "we do not know".
    return { kind: "unknown", reason: "Could not reach the breach service." };
  }

  for (const line of body.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;

    const candidate = line.slice(0, separator).trim().toUpperCase();
    if (candidate !== suffix) continue;

    const count = Number.parseInt(line.slice(separator + 1).trim(), 10);
    return { kind: "breached", count: Number.isFinite(count) ? count : 1 };
  }

  return { kind: "safe" };
}

export interface BreachFinding {
  id: string;
  title: string;
  count: number;
}

export interface BreachSweep {
  breached: BreachFinding[];
  /** Items whose status could not be established. Never counted as safe. */
  unknown: Array<{ id: string; title: string; reason: string }>;
  checked: number;
}

/**
 * Checks many passwords, one request per distinct prefix.
 *
 * Deduplicated by password: a vault with the same password on twenty items
 * should cost one request, not twenty - both for HIBP's sake and because the
 * sweep is visibly slow otherwise.
 */
export async function sweepVault(
  entries: Array<{ id: string; title: string; password: string }>,
  fetcher: Fetcher,
): Promise<BreachSweep> {
  const breached: BreachFinding[] = [];
  const unknown: BreachSweep["unknown"] = [];
  const seen = new Map<string, BreachStatus>();

  for (const entry of entries) {
    if (entry.password.length === 0) continue;

    let status = seen.get(entry.password);
    if (!status) {
      status = await checkPassword(entry.password, fetcher);
      seen.set(entry.password, status);
    }

    if (status.kind === "breached") {
      breached.push({ id: entry.id, title: entry.title, count: status.count });
    } else if (status.kind === "unknown") {
      unknown.push({ id: entry.id, title: entry.title, reason: status.reason });
    }
  }

  return {
    breached: breached.sort((a, b) => b.count - a.count),
    unknown,
    checked: entries.filter((e) => e.password.length > 0).length,
  };
}
