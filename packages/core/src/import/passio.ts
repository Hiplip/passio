import type { CustomField, Item } from "../schema";
import { parseCsvRecords, pick } from "./csv-parse";
import type { ParsedExport, StagedItem } from "./index";

/**
 * Our own CSV, which is also Bitwarden's CSV.
 *
 * This exists because of a hole the export round-trip test found: the CSV
 * passio writes uses Bitwarden's column names, and none of the other importers
 * read those - so exporting to CSV and importing it back produced an empty
 * vault, silently. A manager whose own export cannot be re-imported is a
 * manager that loses data at exactly the moment someone is trying not to.
 *
 * It also means a Bitwarden CSV export works, not just their JSON one.
 */

/** Unpacks the "Name: value" lines the export packs custom fields into. */
function unpackFields(raw: string | undefined): CustomField[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .flatMap((line): CustomField[] => {
      const colon = line.indexOf(":");
      if (colon <= 0) return [];
      const name = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (value.length === 0) return [];
      // The kind is not carried by CSV. Text is the safe default: marking
      // something hidden that is not merely inconveniences, while the reverse
      // would print a secret on screen.
      return [{ name, value, kind: "text" }];
    });
}

export function parsePassioCsv(text: string): ParsedExport {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { staged: [], warnings: ["No rows found in that file."] };
  }

  const staged: StagedItem[] = records.map((record) => {
    const title = pick(record, "name") ?? "Untitled";
    const fields = unpackFields(record.fields);
    const favourite = record.favorite === "1" || record.favorite === "true";
    const notes = pick(record, "notes");
    const isNote = (pick(record, "type") ?? "login").toLowerCase() === "note";

    const base = {
      title,
      favourite: favourite ? true : undefined,
      fields: fields.length > 0 ? fields : undefined,
    };

    const item: Item = isNote
      ? { type: "note", ...base, body: notes }
      : {
          type: "login",
          ...base,
          notes,
          username: pick(record, "login_username", "username"),
          password: pick(record, "login_password", "password"),
          uris: (() => {
            const uri = pick(record, "login_uri", "url");
            return uri ? [{ uri, match: "domain" as const }] : undefined;
          })(),
          totp: (() => {
            const secret = pick(record, "login_totp", "totp");
            return secret ? { secret } : undefined;
          })(),
        };

    return { item, folderName: pick(record, "folder", "grouping") };
  });

  return { staged, warnings: [] };
}
