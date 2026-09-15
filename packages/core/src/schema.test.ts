import { describe, expect, it } from "vitest";

import {
  ITEM_TYPES,
  URI_MATCH_MODES,
  folderSchema,
  itemSchema,
  newCardItem,
  newItem,
  newLoginItem,
  newNoteItem,
  urisOf,
} from "./schema";

describe("login items", () => {
  it("accepts a complete login item", () => {
    const result = itemSchema.safeParse({
      type: "login",
      title: "GitHub",
      username: "me@example.com",
      password: "hunter2",
      uri: "https://github.com",
      notes: "personal account",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a login item with only a title", () => {
    expect(itemSchema.safeParse({ type: "login", title: "Bare" }).success).toBe(true);
  });

  it("rejects a login item with no title", () => {
    expect(itemSchema.safeParse({ type: "login", username: "me" }).success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    expect(itemSchema.safeParse({ type: "login", title: "   " }).success).toBe(false);
  });

  it("trims the title, so two visually identical titles are stored alike", () => {
    const result = itemSchema.safeParse({ type: "login", title: "  GitHub  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("GitHub");
  });
});

describe("the discriminated union", () => {
  it("rejects an unknown type", () => {
    // Deliberately a name that will never be a real item type. This used to say
    // "passport", which stopped being unknown the day passports were added.
    expect(itemSchema.safeParse({ type: "not-a-real-type", title: "X" }).success).toBe(
      false,
    );
  });

  it("rejects a missing type", () => {
    expect(itemSchema.safeParse({ title: "X" }).success).toBe(false);
  });

  it("rejects values that are not objects", () => {
    expect(itemSchema.safeParse("nope").success).toBe(false);
    expect(itemSchema.safeParse(null).success).toBe(false);
    expect(itemSchema.safeParse(42).success).toBe(false);
    expect(itemSchema.safeParse([]).success).toBe(false);
  });

  it("rejects a password that is not a string", () => {
    expect(
      itemSchema.safeParse({ type: "login", title: "X", password: 1234 }).success,
    ).toBe(false);
  });
});

describe("newLoginItem", () => {
  it("produces a value the schema accepts", () => {
    expect(itemSchema.safeParse(newLoginItem()).success).toBe(true);
  });

  it("returns a fresh object each call, so edits cannot bleed between items", () => {
    expect(newLoginItem()).not.toBe(newLoginItem());
  });
});

describe("secure notes", () => {
  it("accepts a note", () => {
    expect(
      itemSchema.safeParse({ type: "note", title: "Wifi", body: "hunter2" }).success,
    ).toBe(true);
  });

  it("accepts a note with an empty body", () => {
    expect(itemSchema.safeParse({ type: "note", title: "Empty", body: "" }).success).toBe(
      true,
    );
  });

  it("rejects a note with no title", () => {
    expect(itemSchema.safeParse({ type: "note", body: "x" }).success).toBe(false);
  });
});

describe("credit cards", () => {
  it("accepts a complete card", () => {
    expect(
      itemSchema.safeParse({
        type: "card",
        title: "Personal Visa",
        cardholderName: "A Person",
        number: "4111111111111111",
        brand: "Visa",
        expMonth: 12,
        expYear: 2030,
        cvv: "123",
        notes: "",
      }).success,
    ).toBe(true);
  });

  it("accepts a card with only a title", () => {
    expect(itemSchema.safeParse({ type: "card", title: "Bare card" }).success).toBe(true);
  });

  it("rejects an out-of-range expiry month", () => {
    expect(itemSchema.safeParse({ type: "card", title: "X", expMonth: 13 }).success).toBe(
      false,
    );
    expect(itemSchema.safeParse({ type: "card", title: "X", expMonth: 0 }).success).toBe(
      false,
    );
  });

  it("rejects an implausible expiry year", () => {
    expect(itemSchema.safeParse({ type: "card", title: "X", expYear: 1999 }).success).toBe(
      false,
    );
  });

  it("keeps the card number a string, preserving leading zeroes", () => {
    const result = itemSchema.safeParse({
      type: "card",
      title: "X",
      number: "0411111111111111",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "card") {
      expect(result.data.number).toBe("0411111111111111");
    }
  });

  it("rejects a card number given as a number", () => {
    expect(
      itemSchema.safeParse({ type: "card", title: "X", number: 4111111111111111 }).success,
    ).toBe(false);
  });
});

describe("the union after adding types", () => {
  it("still accepts login items unchanged", () => {
    expect(itemSchema.safeParse({ type: "login", title: "GitHub" }).success).toBe(true);
  });

  it("rejects a type outside the union", () => {
    expect(itemSchema.safeParse({ type: "definitely-not-an-item", title: "X" }).success).toBe(
      false,
    );
  });

  it("produces valid values from every constructor", () => {
    expect(itemSchema.safeParse(newLoginItem()).success).toBe(true);
    expect(itemSchema.safeParse(newNoteItem()).success).toBe(true);
    expect(itemSchema.safeParse(newCardItem()).success).toBe(true);
  });
});

describe("folders", () => {
  const FOLDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  it("accepts a folderId on every item type", () => {
    for (const item of [
      { type: "login", title: "A", folderId: FOLDER_ID },
      { type: "note", title: "B", folderId: FOLDER_ID },
      { type: "card", title: "C", folderId: FOLDER_ID },
    ]) {
      expect(itemSchema.safeParse(item).success).toBe(true);
    }
  });

  it("treats folderId as optional, so unfiled items stay valid", () => {
    expect(itemSchema.safeParse({ type: "login", title: "A" }).success).toBe(true);
  });

  it("rejects a folderId that is not a uuid", () => {
    expect(
      itemSchema.safeParse({ type: "login", title: "A", folderId: "Work" }).success,
    ).toBe(false);
  });

  it("accepts a folder with a name", () => {
    expect(folderSchema.safeParse({ name: "Work" }).success).toBe(true);
  });

  it("rejects a folder with a blank name", () => {
    expect(folderSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(folderSchema.safeParse({}).success).toBe(false);
  });

  it("trims a folder name", () => {
    const result = folderSchema.safeParse({ name: "  Work  " });
    expect(result.success && result.data.name).toBe("Work");
  });
});

describe("custom fields", () => {
  it("accepts text, hidden and boolean fields", () => {
    const item = {
      type: "login",
      title: "GitHub",
      fields: [
        { name: "Security question", value: "First pet", kind: "text" },
        { name: "Recovery code", value: "abc123", kind: "hidden" },
        { name: "2FA enabled", value: "true", kind: "boolean" },
      ],
    };
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("defaults a field with no kind to text", () => {
    const parsed = itemSchema.safeParse({
      type: "login",
      title: "X",
      fields: [{ name: "n", value: "v" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "login") {
      expect(parsed.data.fields?.[0]?.kind).toBe("text");
    }
  });

  it("rejects a kind outside the three", () => {
    expect(
      itemSchema.safeParse({
        type: "login",
        title: "X",
        fields: [{ name: "n", value: "v", kind: "password" }],
      }).success,
    ).toBe(false);
  });

  it("allows an empty field name, because imports produce them", () => {
    // Refusing would mean dropping data on import, which is worse than an
    // unnamed field the user can rename.
    expect(
      itemSchema.safeParse({
        type: "login",
        title: "X",
        fields: [{ name: "", value: "v", kind: "text" }],
      }).success,
    ).toBe(true);
  });

  it("is available on every item type", () => {
    for (const type of ITEM_TYPES) {
      const item = { ...newItem(type), fields: [{ name: "n", value: "v", kind: "text" }] };
      expect(itemSchema.safeParse(item).success, type).toBe(true);
    }
  });
});

describe("uris", () => {
  it("accepts every match mode", () => {
    for (const match of URI_MATCH_MODES) {
      expect(
        itemSchema.safeParse({
          type: "login",
          title: "X",
          uris: [{ uri: "https://example.com", match }],
        }).success,
        match,
      ).toBe(true);
    }
  });

  it("defaults to domain matching", () => {
    const parsed = itemSchema.safeParse({
      type: "login",
      title: "X",
      uris: [{ uri: "https://example.com" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "login") {
      expect(parsed.data.uris?.[0]?.match).toBe("domain");
    }
  });

  it("rejects an unknown match mode", () => {
    expect(
      itemSchema.safeParse({
        type: "login",
        title: "X",
        uris: [{ uri: "https://example.com", match: "fuzzy" }],
      }).success,
    ).toBe(false);
  });
});

describe("urisOf", () => {
  it("reads the legacy single address", () => {
    expect(urisOf({ type: "login", title: "X", uri: "https://example.com" })).toEqual([
      { uri: "https://example.com", match: "domain" },
    ]);
  });

  it("combines the legacy address with the new list", () => {
    const entries = urisOf({
      type: "login",
      title: "X",
      uri: "https://legacy.com",
      uris: [{ uri: "https://new.com", match: "domain" }],
    });
    expect(entries.map((e) => e.uri)).toEqual(["https://new.com", "https://legacy.com"]);
  });

  it("does not duplicate an address present in both", () => {
    const entries = urisOf({
      type: "login",
      title: "X",
      uri: "https://same.com",
      uris: [{ uri: "https://same.com", match: "exact" }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.match).toBe("exact");
  });

  it("ignores a blank legacy address", () => {
    expect(urisOf({ type: "login", title: "X", uri: "   " })).toEqual([]);
  });

  it("returns nothing for a non-login", () => {
    expect(urisOf({ type: "note", title: "X" })).toEqual([]);
  });
});

describe("every item type", () => {
  it("has a constructor that produces a valid item", () => {
    for (const type of ITEM_TYPES) {
      const parsed = itemSchema.safeParse(newItem(type));
      expect(parsed.success, type).toBe(true);
      if (parsed.success) expect(parsed.data.type).toBe(type);
    }
  });

  it("carries a title", () => {
    for (const type of ITEM_TYPES) {
      expect(newItem(type).title.length, type).toBeGreaterThan(0);
    }
  });

  it("accepts favourite, reprompt and notes", () => {
    for (const type of ITEM_TYPES) {
      const item = { ...newItem(type), favourite: true, reprompt: true, notes: "n" };
      expect(itemSchema.safeParse(item).success, type).toBe(true);
    }
  });

  it("is listed exactly once in ITEM_TYPES", () => {
    expect(new Set(ITEM_TYPES).size).toBe(ITEM_TYPES.length);
  });
});
