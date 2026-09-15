import { describe, expect, it } from "vitest";

import {
  buildExport,
  csvLosses,
  toCsv,
  toPlainJson,
  type ExportInput,
} from "./index";
import { parseCsvRecords } from "../import/csv-parse";
import type { Item } from "../schema";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const FOLDER = "11111111-1111-4111-8111-111111111111";

const input: ExportInput = {
  folders: [{ id: FOLDER, name: "Work" }],
  items: [
    {
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      item: {
        type: "login",
        title: "GitHub",
        folderId: FOLDER,
        favourite: true,
        username: "me",
        password: "pw,with,commas",
        notes: 'he said "hi"',
        uris: [
          { uri: "https://github.com", match: "domain" },
          { uri: "https://gist.github.com", match: "host" },
        ],
        totp: { secret: "JBSWY3DPEHPK3PXP" },
        history: [{ password: "old", changedAt: NOW.toISOString() }],
        fields: [{ name: "Recovery", value: "abc", kind: "hidden" }],
      } satisfies Item,
    },
    {
      id: "aaaaaaaa-0000-4000-8000-000000000002",
      item: { type: "note", title: "Wifi", body: "line one\nline two" },
    },
    {
      id: "aaaaaaaa-0000-4000-8000-000000000003",
      item: { type: "passport", title: "Passport", number: "X123" },
    },
  ],
};

describe("buildExport", () => {
  it("is self-describing", () => {
    // A file with no format marker is a file a future version has to guess at.
    const out = buildExport(input, NOW);
    expect(out.format).toBe("passio");
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe(NOW.toISOString());
  });

  it("keeps item ids, so an import can be matched back up", () => {
    expect(buildExport(input, NOW).items[0]?.id).toBe(input.items[0]?.id);
  });

  it("carries folders by id and name", () => {
    expect(buildExport(input, NOW).folders).toEqual([{ id: FOLDER, name: "Work" }]);
  });
});

describe("toPlainJson", () => {
  it("round-trips every field, losing nothing", () => {
    // The plaintext export is the one that has to be complete; if it loses
    // anything there is no lossless way out at all.
    const parsed = JSON.parse(toPlainJson(input, NOW)) as ReturnType<typeof buildExport>;
    const login = parsed.items[0];
    expect(login).toMatchObject({
      type: "login",
      title: "GitHub",
      username: "me",
      password: "pw,with,commas",
      favourite: true,
    });
    expect(login).toHaveProperty("history");
    expect(login).toHaveProperty("fields");
    expect((login as { uris?: unknown[] }).uris).toHaveLength(2);
  });

  it("keeps a type that CSV cannot represent", () => {
    const parsed = JSON.parse(toPlainJson(input, NOW)) as ReturnType<typeof buildExport>;
    expect(parsed.items[2]?.type).toBe("passport");
  });
});

describe("toCsv", () => {
  it("writes a header and one row per item", () => {
    const records = parseCsvRecords(toCsv(input));
    expect(records).toHaveLength(3);
  });

  it("survives a round trip through the csv reader", () => {
    // Commas, quotes and newlines in the values are the whole risk here.
    const records = parseCsvRecords(toCsv(input));
    expect(records[0]?.login_password).toBe("pw,with,commas");
    expect(records[0]?.notes).toBe('he said "hi"');
    expect(records[1]?.notes).toBe("line one\nline two");
  });

  it("writes the folder by name, not by id", () => {
    // A uuid in a CSV is useless to whatever reads it next.
    expect(parseCsvRecords(toCsv(input))[0]?.folder).toBe("Work");
  });

  it("packs custom fields rather than dropping them", () => {
    expect(parseCsvRecords(toCsv(input))[0]?.fields).toContain("Recovery");
  });

  it("exports the totp secret", () => {
    expect(parseCsvRecords(toCsv(input))[0]?.login_totp).toBe("JBSWY3DPEHPK3PXP");
  });

  it("puts a note's body in the notes column", () => {
    const records = parseCsvRecords(toCsv(input));
    expect(records[1]?.type).toBe("note");
    expect(records[1]?.notes).toBe("line one\nline two");
  });
});

describe("csvLosses", () => {
  it("names the item losing its extra addresses", () => {
    expect(csvLosses(input).join(" ")).toContain("GitHub");
    expect(csvLosses(input).join(" ")).toMatch(/several web addresses/i);
  });

  it("warns about password history", () => {
    expect(csvLosses(input).join(" ")).toMatch(/password history/i);
  });

  it("names the types CSV cannot represent", () => {
    expect(csvLosses(input).join(" ")).toContain("passport");
  });

  it("says nothing when nothing is lost", () => {
    const simple: ExportInput = {
      folders: [],
      items: [{ id: "x", item: { type: "login", title: "A", username: "u" } }],
    };
    expect(csvLosses(simple)).toEqual([]);
  });
});

describe("export then import", () => {
  it("survives a CSV round trip through our own importer", async () => {
    const { parseImport } = await import("../import/index");
    let n = 0;
    const makeId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

    const result = parseImport("passio", toCsv(input), makeId);
    const github = result.items.find((i) => i.title === "GitHub");

    expect(github?.type).toBe("login");
    if (github?.type !== "login") throw new Error("expected a login");
    expect(github.username).toBe("me");
    expect(github.password).toBe("pw,with,commas");
  });
});
