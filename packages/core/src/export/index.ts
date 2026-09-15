import type { Item } from "../schema";

/**
 * Getting a vault back out.
 *
 * Non-negotiable, whatever it costs in support tickets: a password manager that
 * will not export is holding its users' data hostage, and "you can leave
 * whenever you like" is most of what makes it reasonable to arrive in the first
 * place.
 *
 * Three shapes, because they answer different questions:
 *   - encrypted, for a backup you keep
 *   - plaintext JSON, for moving everything without loss
 *   - CSV, for moving to a manager that only reads CSV, accepting the loss
 */

export const EXPORT_FORMATS = ["encrypted", "json", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** A folder as it appears in an export. */
export interface ExportFolder {
  id: string;
  name: string;
}

export interface ExportInput {
  items: Array<{ id: string; item: Item }>;
  folders: ExportFolder[];
}

/** The JSON shape both the plaintext export and the encrypted payload use. */
export interface VaultExport {
  format: "passio";
  version: 1;
  exportedAt: string;
  folders: ExportFolder[];
  items: Array<{ id: string } & Item>;
}

export function buildExport(input: ExportInput, now: Date): VaultExport {
  return {
    format: "passio",
    version: 1,
    exportedAt: now.toISOString(),
    folders: input.folders,
    items: input.items.map(({ id, item }) => ({ id, ...item })),
  };
}

export function toPlainJson(input: ExportInput, now: Date): string {
  return JSON.stringify(buildExport(input, now), null, 2);
}

/**
 * The columns a CSV export carries.
 *
 * Deliberately the Bitwarden-compatible set, because it is the one every other
 * manager can read. Everything outside it is lost, which is why `csvLosses`
 * exists and why the UI states it before the file is written.
 */
const CSV_COLUMNS = [
  "folder",
  "favorite",
  "type",
  "name",
  "notes",
  "fields",
  "login_uri",
  "login_username",
  "login_password",
  "login_totp",
] as const;

function escapeCsv(value: string): string {
  // Quote anything that could otherwise change the shape of the file.
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(input: ExportInput): string {
  const folderNames = new Map(input.folders.map((f) => [f.id, f.name]));

  const rows = input.items.map(({ item }) => {
    const login = item.type === "login" ? item : undefined;
    const uri = login?.uris?.[0]?.uri ?? login?.uri ?? "";

    // Custom fields survive as a single packed column, which is what Bitwarden
    // does. Lossy in shape, but the values are all there.
    const fields = (item.fields ?? [])
      .map((f) => `${f.name}: ${f.value}`)
      .join("\n");

    const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
      folder: item.folderId ? (folderNames.get(item.folderId) ?? "") : "",
      favorite: item.favourite ? "1" : "",
      type: item.type === "note" ? "note" : "login",
      name: item.title,
      notes: item.type === "note" ? (item.body ?? "") : (item.notes ?? ""),
      fields,
      login_uri: uri,
      login_username: login?.username ?? "",
      login_password: login?.password ?? "",
      login_totp: login?.totp?.secret ?? "",
    };

    return CSV_COLUMNS.map((column) => escapeCsv(cells[column])).join(",");
  });

  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

/**
 * What a CSV export will not carry, named per item.
 *
 * Shown BEFORE the file is written, not after. A silent loss discovered weeks
 * later, in the copy you kept because you were leaving, is the worst possible
 * version of this.
 */
export function csvLosses(input: ExportInput): string[] {
  const losses: string[] = [];
  const typed = new Set<string>();

  for (const { item } of input.items) {
    if (item.type !== "login" && item.type !== "note") typed.add(item.type);
    if (item.type === "login" && (item.uris?.length ?? 0) > 1) {
      losses.push(`“${item.title}” has several web addresses; only the first is exported.`);
    }
    if (item.type === "login" && (item.history?.length ?? 0) > 0) {
      losses.push(`“${item.title}” has password history, which CSV cannot carry.`);
    }
  }

  if (typed.size > 0) {
    losses.push(
      `${typed.size} item ${typed.size === 1 ? "type" : "types"} have no CSV equivalent ` +
        `(${[...typed].join(", ")}); their fields are packed into the notes column.`,
    );
  }

  return losses;
}
