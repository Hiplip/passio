/**
 * A CSV reader that does not lose data.
 *
 * Every password manager exports CSV, and every naive `split(",")` mangles it.
 * A note containing a comma, a password containing a quote, a field with a
 * newline in it - all of these are legal CSV and all of them silently corrupt
 * an import written the easy way. For a password manager that means a password
 * that no longer opens anything, discovered weeks later.
 *
 * Handles, because real exports contain all of them:
 *   - quoted fields with embedded commas, newlines and doubled quotes
 *   - CRLF and LF line endings, mixed in one file
 *   - a UTF-8 byte order mark, which Excel adds and which otherwise becomes
 *     part of the first column's name
 *   - a trailing newline, which must not produce a phantom empty row
 */

/** Splits CSV text into rows of raw string cells. */
export function parseCsv(input: string): string[][] {
  // Excel writes a BOM. Without this the first header reads "\uFEFFname" and
  // every lookup for "name" misses.
  const text = input.replace(/^\uFEFF/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };

  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      endCell();
      i += 1;
      continue;
    }

    if (char === "\r") {
      // Swallow the LF of a CRLF pair rather than producing an empty row.
      if (text[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }

    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }

    cell += char;
    i += 1;
  }

  // A file ending in a newline has already closed its last row; one ending
  // mid-cell has not.
  if (cell.length > 0 || row.length > 0) endRow();

  return rows;
}

/**
 * CSV as records keyed by header name.
 *
 * Headers are lowercased and trimmed, because the same manager spells them
 * differently across versions and nobody should have to care.
 */
export function parseCsvRecords(input: string): Array<Record<string, string>> {
  const rows = parseCsv(input);
  const header = rows[0];
  if (!header) return [];

  const keys = header.map((h) => h.trim().toLowerCase());

  return rows.slice(1).flatMap((row) => {
    // A blank line in the middle of a file is not a record.
    if (row.every((cell) => cell.trim().length === 0)) return [];

    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = row[index] ?? "";
    });
    return [record];
  });
}

/** The first of several possible column names that is actually present. */
export function pick(
  record: Record<string, string>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value.trim().length > 0) return value;
  }
  return undefined;
}
