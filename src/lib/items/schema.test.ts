import { describe, expect, it } from "vitest";

import { itemSchema, newCardItem, newLoginItem, newNoteItem } from "./schema";

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
    expect(itemSchema.safeParse({ type: "passport", title: "X" }).success).toBe(false);
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
    expect(itemSchema.safeParse({ type: "identity", title: "X" }).success).toBe(false);
  });

  it("produces valid values from every constructor", () => {
    expect(itemSchema.safeParse(newLoginItem()).success).toBe(true);
    expect(itemSchema.safeParse(newNoteItem()).success).toBe(true);
    expect(itemSchema.safeParse(newCardItem()).success).toBe(true);
  });
});
