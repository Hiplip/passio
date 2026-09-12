/**
 * Card numbers are stored and handled as strings, never numbers.
 *
 * A leading zero is significant and a 16-digit number exceeds what a JavaScript
 * number represents exactly, so `Number(...)` would silently corrupt both.
 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Amex prints as 4-6-5; everything else groups in fours. */
function groupForDisplay(digits: string): string[] {
  if (digits.length === 15) {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10)].filter(Boolean);
  }
  return digits.match(/.{1,4}/g) ?? [];
}

/** Formats for reading and typing. Display formatting never reaches storage. */
export function formatCardNumber(value: string): string {
  return groupForDisplay(digitsOnly(value)).join(" ");
}

/**
 * Masks everything but the last four digits - the convention every card issuer
 * and receipt uses, so it is what people recognise their own card by.
 */
export function maskCardNumber(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length === 0) return "";
  if (digits.length <= 4) return "•".repeat(digits.length);

  const masked = "•".repeat(digits.length - 4) + digits.slice(-4);

  if (digits.length === 15) {
    return [masked.slice(0, 3), masked.slice(3, 9), masked.slice(9)].join(" ");
  }
  return masked.match(/.{1,4}/g)?.join(" ") ?? masked;
}
