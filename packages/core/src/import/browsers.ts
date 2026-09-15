import type { Item } from "../schema";
import { parseCsvRecords, pick } from "./csv-parse";
import { toCustomFields, type ParsedExport, type StagedItem } from "./index";

/**
 * The browser and KeePass CSV exports.
 *
 * All three are flat, login-only, and differ mainly in column names. Chrome,
 * Edge and Brave share a format; Firefox writes its own; KeePass writes a third
 * with a folder column.
 *
 * Column names are matched loosely because the same browser spells them
 * differently across versions - "url" became "login_uri" and back again - and a
 * rename should not silently produce an import of blank entries.
 */

/** Columns handled explicitly; anything else becomes a custom field. */
function leftovers(
  record: Record<string, string>,
  handled: readonly string[],
): Record<string, string | undefined> {
  const extras: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(record)) {
    if (handled.includes(key)) continue;
    extras[key] = value;
  }
  return extras;
}

function loginFrom(
  record: Record<string, string>,
  handled: readonly string[],
  parts: { title?: string; username?: string; password?: string; uri?: string; notes?: string },
): Item {
  const fields = toCustomFields(leftovers(record, handled));
  return {
    type: "login",
    title: parts.title ?? parts.uri ?? "Untitled",
    username: parts.username,
    password: parts.password,
    uris: parts.uri ? [{ uri: parts.uri, match: "domain" }] : undefined,
    notes: parts.notes,
    fields: fields.length > 0 ? fields : undefined,
  };
}

function emptyFile(what: string): ParsedExport {
  return { staged: [], warnings: [`No rows found in that ${what} file.`] };
}

export function parseChromeCsv(text: string): ParsedExport {
  const records = parseCsvRecords(text);
  if (records.length === 0) return emptyFile("Chrome");

  const handled = ["name", "url", "username", "password", "note", "notes"];
  const staged: StagedItem[] = records.map((record) => ({
    item: loginFrom(record, handled, {
      title: pick(record, "name"),
      username: pick(record, "username"),
      password: pick(record, "password"),
      uri: pick(record, "url"),
      notes: pick(record, "note", "notes"),
    }),
  }));

  return { staged, warnings: [] };
}

export function parseFirefoxCsv(text: string): ParsedExport {
  const records = parseCsvRecords(text);
  if (records.length === 0) return emptyFile("Firefox");

  const handled = [
    "url",
    "username",
    "password",
    "httprealm",
    "formactionorigin",
    "guid",
    "timecreated",
    "timelastused",
    "timepasswordchanged",
  ];

  const staged: StagedItem[] = records.map((record) => {
    const uri = pick(record, "url");
    return {
      item: loginFrom(record, handled, {
        // Firefox has no name column at all, so the host is the only title
        // available. Better than eight hundred items called "Untitled".
        title: uri ? hostOf(uri) : undefined,
        username: pick(record, "username"),
        password: pick(record, "password"),
        uri,
      }),
    };
  });

  return { staged, warnings: [] };
}

export function parseKeepassCsv(text: string): ParsedExport {
  const records = parseCsvRecords(text);
  if (records.length === 0) return emptyFile("KeePass");

  const handled = ["account", "title", "login name", "login_name", "password", "web site", "url", "comments", "notes", "group"];

  const staged: StagedItem[] = records.map((record) => ({
    item: loginFrom(record, handled, {
      title: pick(record, "account", "title"),
      username: pick(record, "login name", "login_name", "username"),
      password: pick(record, "password"),
      uri: pick(record, "web site", "url"),
      notes: pick(record, "comments", "notes"),
    }),
    folderName: pick(record, "group"),
  }));

  return { staged, warnings: [] };
}

/** A readable name from a URL, for exports that have no title column. */
function hostOf(raw: string): string {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}
