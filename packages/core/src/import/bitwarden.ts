import type { CustomField, Item, UriEntry } from "../schema";
import { toCustomFields, type ParsedExport, type StagedItem } from "./index";

/**
 * Bitwarden's unencrypted JSON export.
 *
 * Their numeric enums are the trap. `type` and `field.type` are integers, and
 * guessing at them silently miscategorises every item - a hidden field imported
 * as plain text is a password rendered on screen. The mappings below come from
 * their export format, not from inference.
 */

/** Bitwarden item types. */
const LOGIN = 1;
const NOTE = 2;
const CARD = 3;
const IDENTITY = 4;

/** Bitwarden custom-field types. */
const FIELD_TEXT = 0;
const FIELD_HIDDEN = 1;
const FIELD_BOOLEAN = 2;

/** Bitwarden URI match modes, in their numbering. Null means "use the default". */
const URI_MATCH: Record<number, UriEntry["match"]> = {
  0: "domain",
  1: "host",
  2: "startsWith",
  3: "exact",
  4: "regex",
  5: "never",
};

interface RawField {
  name?: unknown;
  value?: unknown;
  type?: unknown;
}

interface RawUri {
  uri?: unknown;
  match?: unknown;
}

interface RawItem {
  type?: unknown;
  name?: unknown;
  notes?: unknown;
  favorite?: unknown;
  reprompt?: unknown;
  folderId?: unknown;
  fields?: unknown;
  login?: unknown;
  card?: unknown;
  identity?: unknown;
  secureNote?: unknown;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

function fieldsOf(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): CustomField[] => {
    const field = entry as RawField;
    const name = typeof field.name === "string" ? field.name : "";
    const value = typeof field.value === "string" ? field.value : "";
    if (value.trim().length === 0) return [];

    const kind =
      field.type === FIELD_HIDDEN
        ? ("hidden" as const)
        : field.type === FIELD_BOOLEAN
          ? ("boolean" as const)
          : ("text" as const);

    // Anything with an unrecognised type still comes across, as text. Losing it
    // would be worse than mislabelling it.
    void FIELD_TEXT;
    return [{ name, value, kind }];
  });
}

function urisOfRaw(raw: unknown): UriEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): UriEntry[] => {
    const item = entry as RawUri;
    const uri = str(item.uri);
    if (!uri) return [];
    const match =
      typeof item.match === "number" ? (URI_MATCH[item.match] ?? "domain") : "domain";
    return [{ uri, match }];
  });
}

export function parseBitwarden(text: string): ParsedExport {
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { staged: [], warnings: ["That file is not valid JSON."] };
  }

  const root = parsed as { items?: unknown; folders?: unknown; encrypted?: unknown };

  if (root.encrypted === true) {
    return {
      staged: [],
      warnings: [
        "That is an encrypted Bitwarden export. Export again with encryption turned off.",
      ],
    };
  }

  if (!Array.isArray(root.items)) {
    return { staged: [], warnings: ["No items found in that file."] };
  }

  // Bitwarden references folders by id; we need their names.
  const folderNames = new Map<string, string>();
  if (Array.isArray(root.folders)) {
    for (const entry of root.folders) {
      const folder = entry as { id?: unknown; name?: unknown };
      if (typeof folder.id === "string" && typeof folder.name === "string") {
        folderNames.set(folder.id, folder.name);
      }
    }
  }

  const staged: StagedItem[] = [];

  for (const entry of root.items) {
    const raw = entry as RawItem;
    const title = str(raw.name) ?? "Untitled";
    const common = {
      title,
      notes: str(raw.notes),
      favourite: raw.favorite === true ? true : undefined,
      // Bitwarden's reprompt is 0 or 1.
      reprompt: raw.reprompt === 1 ? true : undefined,
      fields: fieldsOf(raw.fields).length > 0 ? fieldsOf(raw.fields) : undefined,
    };

    const folderName =
      typeof raw.folderId === "string" ? folderNames.get(raw.folderId) : undefined;

    const item = toItem(raw, common, title, warnings);
    if (item) staged.push({ item, folderName });
  }

  return { staged, warnings };
}

function toItem(
  raw: RawItem,
  common: {
    title: string;
    notes?: string;
    favourite?: boolean;
    reprompt?: boolean;
    fields?: CustomField[];
  },
  title: string,
  warnings: string[],
): Item | null {
  switch (raw.type) {
    case LOGIN: {
      const login = (raw.login ?? {}) as {
        username?: unknown;
        password?: unknown;
        totp?: unknown;
        uris?: unknown;
      };
      const uris = urisOfRaw(login.uris);
      const totpSecret = str(login.totp);

      return {
        type: "login",
        ...common,
        username: str(login.username),
        password: str(login.password),
        uris: uris.length > 0 ? uris : undefined,
        // Bitwarden stores either a bare secret or a full otpauth URL. The
        // caller parses otpauth; a bare secret goes straight in.
        totp: totpSecret ? { secret: extractTotpSecret(totpSecret) } : undefined,
      };
    }

    case NOTE:
      return { type: "note", ...common, body: str(raw.notes) };

    case CARD: {
      const card = (raw.card ?? {}) as {
        cardholderName?: unknown;
        number?: unknown;
        brand?: unknown;
        expMonth?: unknown;
        expYear?: unknown;
        code?: unknown;
      };
      const month = Number(card.expMonth);
      const year = Number(card.expYear);
      return {
        type: "card",
        ...common,
        cardholderName: str(card.cardholderName),
        number: str(card.number),
        brand: str(card.brand),
        expMonth: Number.isInteger(month) && month >= 1 && month <= 12 ? month : undefined,
        expYear: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : undefined,
        cvv: str(card.code),
      };
    }

    case IDENTITY: {
      const id = (raw.identity ?? {}) as Record<string, unknown>;
      return {
        type: "identity",
        ...common,
        firstName: str(id.firstName),
        middleName: str(id.middleName),
        lastName: str(id.lastName),
        company: str(id.company),
        email: str(id.email),
        phone: str(id.phone),
        address1: str(id.address1),
        address2: [str(id.address2), str(id.address3)].filter(Boolean).join(", ") || undefined,
        city: str(id.city),
        state: str(id.state),
        postalCode: str(id.postalCode),
        country: str(id.country),
        // Bitwarden identities carry government numbers with no home on ours;
        // they become custom fields rather than vanishing.
        fields: [
          ...(common.fields ?? []),
          ...toCustomFields(
            {
              "SSN": str(id.ssn),
              "Passport number": str(id.passportNumber),
              "Licence number": str(id.licenseNumber),
              "Username": str(id.username),
            },
            new Set(["SSN", "Passport number", "Licence number"]),
          ),
        ].filter((f) => f.value.trim().length > 0),
      };
    }

    default:
      warnings.push(`Skipped “${title}”: unrecognised Bitwarden item type.`);
      return null;
  }
}

/** Bitwarden stores TOTP as a bare secret or a full otpauth URL. */
function extractTotpSecret(value: string): string {
  if (!value.toLowerCase().startsWith("otpauth://")) return value;
  try {
    const secret = new URL(value).searchParams.get("secret");
    return secret ?? value;
  } catch {
    return value;
  }
}
