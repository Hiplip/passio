import { describe, expect, it } from "vitest";

import { itemSchema, newLoginItem } from "./schema";

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
