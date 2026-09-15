import { describe, expect, it } from "vitest";

import { fieldValue, TYPE_SPECS, withField } from "./fields";
import { ITEM_TYPES, itemSchema, newItem, type ItemType } from "./schema";

describe("TYPE_SPECS", () => {
  it("covers every item type", () => {
    for (const type of ITEM_TYPES) {
      expect(TYPE_SPECS[type], type).toBeDefined();
    }
    expect(Object.keys(TYPE_SPECS).sort()).toEqual([...ITEM_TYPES].sort());
  });

  it("gives every type at least one field", () => {
    for (const type of ITEM_TYPES) {
      expect(TYPE_SPECS[type].fields.length, type).toBeGreaterThan(0);
    }
  });

  it("names every field only once per type", () => {
    for (const type of ITEM_TYPES) {
      const keys = TYPE_SPECS[type].fields.map((f) => f.key);
      expect(new Set(keys).size, type).toBe(keys.length);
    }
  });

  /**
   * The load-bearing test.
   *
   * The table drives the editors, so a key that does not exist on the schema
   * renders an input that silently writes a field nothing ever reads - and the
   * user's data goes into a property the item type does not have. Typescript
   * cannot catch it, because the table spans eighteen shapes and is keyed by
   * string.
   */
  it("only names fields the schema actually accepts", () => {
    for (const type of ITEM_TYPES) {
      for (const field of TYPE_SPECS[type].fields) {
        const probe = { ...newItem(type), [field.key]: "probe" };
        const parsed = itemSchema.safeParse(probe);

        // expMonth and expYear are constrained numbers on the schema, so a
        // string probe is correctly rejected. Probe each with a value inside
        // its own range - 4 is a valid month but not a valid year.
        if (!parsed.success && (field.kind === "month" || field.kind === "year")) {
          const probeValue = field.kind === "month" ? 4 : 2030;
          expect(
            itemSchema.safeParse({ ...newItem(type), [field.key]: probeValue }).success,
            `${type}.${field.key}`,
          ).toBe(true);
          continue;
        }

        expect(parsed.success, `${type}.${field.key} is not on the schema`).toBe(true);
      }
    }
  });

  it("only offers copy actions for fields it also renders", () => {
    for (const type of ITEM_TYPES) {
      const keys = new Set(TYPE_SPECS[type].fields.map((f) => f.key));
      for (const action of TYPE_SPECS[type].copyable) {
        expect(keys.has(action.key), `${type}.${action.key}`).toBe(true);
      }
    }
  });

  it("gives every type a distinct label", () => {
    const labels = ITEM_TYPES.map((t) => TYPE_SPECS[t].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("marks the obviously secret fields as secret", () => {
    // Not exhaustive - a spot check that the table has not been filled in
    // mechanically. A seed phrase rendered in plain text on screen would be the
    // single worst bug this product could ship.
    const secretOf = (type: ItemType, key: string) =>
      TYPE_SPECS[type].fields.find((f) => f.key === key)?.kind;

    expect(secretOf("login", "password")).toBe("secret");
    expect(secretOf("card", "cvv")).toBe("secret");
    expect(secretOf("cryptoWallet", "seedPhrase")).toBe("secret");
    expect(secretOf("cryptoWallet", "privateKey")).toBe("secret");
    expect(secretOf("sshKey", "privateKey")).toBe("secret");
    expect(secretOf("bankAccount", "pin")).toBe("secret");
    expect(secretOf("wirelessRouter", "wifiPassword")).toBe("secret");
    expect(secretOf("database", "connectionString")).toBe("secret");
  });

  it("does not mark a public value as secret", () => {
    const kindOf = (type: ItemType, key: string) =>
      TYPE_SPECS[type].fields.find((f) => f.key === key)?.kind;

    expect(kindOf("login", "username")).toBe("text");
    expect(kindOf("cryptoWallet", "publicAddress")).toBe("text");
    expect(kindOf("sshKey", "publicKey")).toBe("multiline");
  });
});

describe("fieldValue", () => {
  it("reads a string field", () => {
    expect(fieldValue({ type: "login", title: "X", username: "me" }, "username")).toBe("me");
  });

  it("reads a number field as a string, for the editor", () => {
    expect(fieldValue({ type: "card", title: "X", expMonth: 4 }, "expMonth")).toBe("4");
  });

  it("returns undefined for a missing field", () => {
    expect(fieldValue({ type: "login", title: "X" }, "username")).toBeUndefined();
  });

  it("returns undefined rather than an object for a structured field", () => {
    // `totp` is an object; handing it to a text input would render
    // "[object Object]" and then save that string over the real config.
    expect(
      fieldValue({ type: "login", title: "X", totp: { secret: "AAAA" } }, "totp"),
    ).toBeUndefined();
  });
});

describe("withField", () => {
  it("writes a field and keeps the type tag", () => {
    const next = withField({ type: "login", title: "X" }, "username", "me");
    expect(next.type).toBe("login");
    expect(fieldValue(next, "username")).toBe("me");
  });

  it("produces something the schema still accepts", () => {
    for (const type of ITEM_TYPES) {
      const spec = TYPE_SPECS[type];
      const textField = spec.fields.find((f) => f.kind === "text" || f.kind === "secret");
      if (!textField) continue;
      const next = withField(newItem(type), textField.key, "value");
      expect(itemSchema.safeParse(next).success, type).toBe(true);
    }
  });
});
