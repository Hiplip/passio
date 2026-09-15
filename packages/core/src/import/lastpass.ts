import type { Item } from "../schema";
import { parseCsvRecords, pick } from "./csv-parse";
import { toCustomFields, type ParsedExport, type StagedItem } from "./index";

/**
 * LastPass CSV.
 *
 * Two quirks worth knowing, both of which lose data if ignored:
 *
 * 1. Secure notes are logins with `url` set to the literal string
 *    "http://sn". Treating that as a website produces an item that offers to
 *    fill a site that does not exist.
 * 2. Typed notes (bank accounts, passports, and so on) pack their fields into
 *    the `extra` column as `Key:Value` lines, with a `NoteType:` header. Those
 *    lines are the whole content of the item, so parsing them is the difference
 *    between importing a bank account and importing a blob of text.
 */

const SECURE_NOTE_URL = "http://sn";

/** LastPass note types that map onto one of ours. */
const NOTE_TYPE_MAP: Record<string, Item["type"]> = {
  "Bank Account": "bankAccount",
  "Credit Card": "card",
  "Passport": "passport",
  "Driver's License": "driversLicence",
  "Email Account": "emailAccount",
  "Server": "server",
  "Database": "database",
  "Membership": "membership",
  "Software License": "softwareLicence",
  "Wi-Fi Password": "wirelessRouter",
  "Health Insurance": "medicalRecord",
  "Social Security": "identity",
  "Address": "identity",
};

/** Field names LastPass uses, mapped onto ours per target type. */
const FIELD_MAP: Partial<Record<Item["type"], Record<string, string>>> = {
  bankAccount: {
    "Bank Name": "bankName",
    "Account Number": "accountNumber",
    "Routing Number": "routingNumber",
    "IBAN Number": "iban",
    "SWIFT Code": "swift",
    "Pin": "pin",
  },
  card: {
    "Name on Card": "cardholderName",
    "Number": "number",
    "Security Code": "cvv",
    "Type": "brand",
  },
  passport: {
    "Name": "fullName",
    "Number": "number",
    "Nationality": "nationality",
    "Issued Date": "issuedOn",
    "Expiration Date": "expiresOn",
  },
  driversLicence: {
    "Name": "fullName",
    "Number": "number",
    "State": "issuingAuthority",
    "Class": "classes",
    "Issued Date": "issuedOn",
    "Expiration Date": "expiresOn",
  },
  emailAccount: {
    "Username": "username",
    "Password": "password",
    "Server": "incomingHost",
    "SMTP Server": "outgoingHost",
  },
  server: {
    "Hostname": "hostname",
    "Username": "username",
    "Password": "password",
  },
  database: {
    "Type": "engine",
    "Hostname": "host",
    "Port": "port",
    "Database": "database",
    "Username": "username",
    "Password": "password",
  },
  membership: {
    "Organization": "organisation",
    "Membership Number": "memberId",
    "Member Name": "memberName",
    "Expiration Date": "expiresOn",
  },
  softwareLicence: {
    "License Key": "licenceKey",
    "Publisher": "product",
    "Version": "version",
    "Licensee": "licensedTo",
  },
  wirelessRouter: {
    "SSID": "networkName",
    "Password": "wifiPassword",
  },
  medicalRecord: {
    "Company": "provider",
    "Policy Number": "policyNumber",
    "Group ID": "groupNumber",
  },
  identity: {
    "Name": "firstName",
    "Address": "address1",
    "City / Town": "city",
    "State": "state",
    "Zip / Postal Code": "postalCode",
    "Country": "country",
    "Email Address": "email",
    "Phone": "phone",
  },
};

/** Splits LastPass's `Key:Value` note body. */
function parseExtra(extra: string): { noteType?: string; pairs: Record<string, string> } {
  const pairs: Record<string, string> = {};
  let noteType: string | undefined;

  for (const line of extra.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key === "NoteType") noteType = value;
    else if (value.length > 0) pairs[key] = value;
  }

  return { noteType, pairs };
}

export function parseLastpassCsv(text: string): ParsedExport {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { staged: [], warnings: ["No rows found in that LastPass file."] };
  }

  const warnings: string[] = [];
  const staged: StagedItem[] = [];

  for (const record of records) {
    const title = pick(record, "name") ?? "Untitled";
    const folderName = pick(record, "grouping");
    const url = pick(record, "url") ?? "";
    const extra = record.extra ?? "";
    const favourite = record.fav === "1" ? true : undefined;

    const isNote = url.trim().toLowerCase() === SECURE_NOTE_URL;

    if (!isNote) {
      staged.push({
        folderName,
        item: {
          type: "login",
          title,
          favourite,
          username: pick(record, "username"),
          password: pick(record, "password"),
          uris: url ? [{ uri: url, match: "domain" }] : undefined,
          notes: extra.trim().length > 0 ? extra : undefined,
        },
      });
      continue;
    }

    const { noteType, pairs } = parseExtra(extra);
    const target = noteType ? NOTE_TYPE_MAP[noteType] : undefined;

    if (!target) {
      // A plain secure note, or a typed one we have no shape for. The body
      // survives intact either way.
      if (noteType) {
        warnings.push(
          `“${title}” was a ${noteType} note; it was imported as a secure note with its fields intact.`,
        );
      }
      staged.push({
        folderName,
        item: { type: "note", title, favourite, body: extra },
      });
      continue;
    }

    const map = FIELD_MAP[target] ?? {};
    const mapped: Record<string, string> = {};
    const unmapped: Record<string, string> = {};

    for (const [key, value] of Object.entries(pairs)) {
      const destination = map[key];
      if (destination) mapped[destination] = value;
      else unmapped[key] = value;
    }

    const extras = toCustomFields(unmapped);

    staged.push({
      folderName,
      item: {
        type: target,
        title,
        favourite,
        ...mapped,
        fields: extras.length > 0 ? extras : undefined,
      },
    });
  }

  return { staged, warnings };
}
