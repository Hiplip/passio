import { Secret, TOTP, URI } from "otpauth";

export interface TotpConfig {
  /** Base32, as every authenticator app presents it. */
  secret: string;
  digits?: number;
  period?: number;
  algorithm?: string;
}

export const TOTP_DEFAULTS = { digits: 6, period: 30, algorithm: "SHA1" } as const;

function toTotp(config: TotpConfig): TOTP {
  return new TOTP({
    secret: Secret.fromBase32(config.secret),
    digits: config.digits ?? TOTP_DEFAULTS.digits,
    period: config.period ?? TOTP_DEFAULTS.period,
    algorithm: config.algorithm ?? TOTP_DEFAULTS.algorithm,
  });
}

/**
 * Generates the current code entirely client-side, against the browser clock.
 *
 * No server is involved, which is what lets this keep working offline - and
 * means the server never sees the TOTP seed or any code derived from it.
 */
export function generateTotp(
  config: TotpConfig,
  timestampMs: number = Date.now(),
): string {
  return toTotp(config).generate({ timestamp: timestampMs });
}

/**
 * Seconds left in the current window, from `period` down to 1.
 *
 * Never returns 0: at the exact boundary a full period has just begun. A zero
 * would make the countdown ring read as expired for a moment while the code on
 * screen was still valid.
 */
export function secondsRemaining(
  period: number,
  timestampMs: number = Date.now(),
): number {
  return period - (Math.floor(timestampMs / 1000) % period);
}

/**
 * Accepts whatever the user pasted: an `otpauth://` URI copied from a site's
 * QR-code page, or a bare base32 secret typed by hand.
 *
 * Returns null rather than throwing - unparseable input is ordinary user error
 * on a form, not an exceptional condition.
 *
 * Parameters equal to the defaults are omitted, so a stored item carries only
 * what actually differs from the norm.
 */
export function parseTotpInput(input: string): TotpConfig | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.toLowerCase().startsWith("otpauth://")) {
    try {
      const parsed = URI.parse(trimmed);
      if (!(parsed instanceof TOTP)) return null; // HOTP is counter-based; not supported

      const config: TotpConfig = { secret: parsed.secret.base32 };
      if (parsed.digits !== TOTP_DEFAULTS.digits) config.digits = parsed.digits;
      if (parsed.period !== TOTP_DEFAULTS.period) config.period = parsed.period;
      if (parsed.algorithm !== TOTP_DEFAULTS.algorithm) config.algorithm = parsed.algorithm;
      return config;
    } catch {
      return null;
    }
  }

  const normalized = trimmed.replace(/[\s-]/g, "").toUpperCase();
  try {
    Secret.fromBase32(normalized); // throws when the alphabet is wrong
    return { secret: normalized };
  } catch {
    return null;
  }
}
