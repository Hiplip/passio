import { parseCsvRecords, pick } from "./csv-parse";
import { toCustomFields, type ParsedExport, type StagedItem } from "./index";

/**
 * 1Password's CSV export.
 *
 * Their CSV is login-shaped whatever the item actually was, with everything
 * that does not fit dumped into `notes`. There is no type column, so a passport
 * exported from 1Password arrives indistinguishable from a login - which is a
 * limitation of their format, not of this parser, and the warning says so
 * rather than pretending otherwise.
 *
 * Column names vary between their exporter versions; several spellings are
 * accepted for each.
 */
export function parseOnePassword(text: string): ParsedExport {
  // A .1pux file is a zip, which cannot be read from a pasted string. Saying so
  // is better than parsing binary as CSV and reporting nothing found.
  if (text.startsWith("PK")) {
    return {
      staged: [],
      warnings: [
        "That is a .1pux archive. Export as CSV from 1Password instead, or unzip it and import the CSV inside.",
      ],
    };
  }

  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { staged: [], warnings: ["No rows found in that 1Password file."] };
  }

  const handled = [
    "title",
    "url",
    "urls",
    "website",
    "username",
    "password",
    "notes",
    "note",
    "otpauth",
    "one-time password",
    "favorite",
    "type",
  ];

  const warnings: string[] = [];
  const staged: StagedItem[] = records.map((record) => {
    const extras = toCustomFields(
      Object.fromEntries(
        Object.entries(record).filter(([key]) => !handled.includes(key)),
      ),
    );

    const uri = pick(record, "url", "urls", "website");
    const otp = pick(record, "otpauth", "one-time password");

    return {
      item: {
        type: "login",
        title: pick(record, "title") ?? "Untitled",
        username: pick(record, "username"),
        password: pick(record, "password"),
        uris: uri ? [{ uri, match: "domain" as const }] : undefined,
        notes: pick(record, "notes", "note"),
        favourite: record.favorite === "true" ? true : undefined,
        totp: otp ? { secret: extractSecret(otp) } : undefined,
        fields: extras.length > 0 ? extras : undefined,
      },
    };
  });

  warnings.push(
    "1Password's CSV has no item-type column, so everything arrives as a login with its other fields kept as custom fields. Re-type anything that should be a card or an identity.",
  );

  return { staged, warnings };
}

function extractSecret(value: string): string {
  if (!value.toLowerCase().startsWith("otpauth://")) return value;
  try {
    return new URL(value).searchParams.get("secret") ?? value;
  } catch {
    return value;
  }
}
