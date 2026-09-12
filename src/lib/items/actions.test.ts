import { describe, expect, it } from "vitest";

import { copyActionsFor, launchUrlFor } from "./actions";
import type { CardItem, LoginItem, NoteItem } from "./schema";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("copyActionsFor", () => {
  it("offers username, password and code for a complete login", () => {
    const item: LoginItem = {
      type: "login",
      title: "GitHub",
      username: "me@example.com",
      password: "hunter2",
      totp: { secret: RFC_SECRET },
    };
    expect(copyActionsFor(item, 59_000).map((a) => a.key)).toEqual([
      "username",
      "password",
      "totp",
    ]);
  });

  it("generates the one-time code from the RFC vector", () => {
    const item: LoginItem = {
      type: "login",
      title: "X",
      totp: { secret: RFC_SECRET },
    };
    expect(copyActionsFor(item, 59_000)[0]?.value).toBe("287082");
  });

  it("omits fields the item does not have", () => {
    const item: LoginItem = { type: "login", title: "Bare" };
    expect(copyActionsFor(item)).toEqual([]);
  });

  it("omits whitespace-only fields, which would copy nothing useful", () => {
    const item: LoginItem = { type: "login", title: "X", username: "   ", password: "" };
    expect(copyActionsFor(item)).toEqual([]);
  });

  it("never returns an action with an empty value", () => {
    const items: Array<LoginItem | NoteItem | CardItem> = [
      { type: "login", title: "A", username: "u", password: "p" },
      { type: "note", title: "B", body: "text" },
      { type: "card", title: "C", number: "4111111111111111", cvv: "123" },
    ];
    for (const item of items) {
      for (const action of copyActionsFor(item)) {
        expect(action.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("survives a malformed totp secret, losing only that entry", () => {
    const item: LoginItem = {
      type: "login",
      title: "X",
      password: "p",
      totp: { secret: "not-base32!!" },
    };
    expect(copyActionsFor(item).map((a) => a.key)).toEqual(["password"]);
  });

  it("offers the body of a note", () => {
    const item: NoteItem = { type: "note", title: "Wifi", body: "swordfish" };
    expect(copyActionsFor(item)).toEqual([
      { key: "body", label: "Copy note", value: "swordfish" },
    ]);
  });

  it("offers number and security code for a card", () => {
    const item: CardItem = {
      type: "card",
      title: "Visa",
      number: "4111111111111111",
      cvv: "123",
    };
    expect(copyActionsFor(item).map((a) => a.key)).toEqual(["number", "cvv"]);
  });
});

describe("launchUrlFor", () => {
  it("returns an https url unchanged", () => {
    expect(
      launchUrlFor({ type: "login", title: "X", uri: "https://github.com" }),
    ).toBe("https://github.com/");
  });

  it("upgrades a bare domain, which is what people actually type", () => {
    expect(launchUrlFor({ type: "login", title: "X", uri: "github.com" })).toBe(
      "https://github.com/",
    );
  });

  it("returns null when there is no uri", () => {
    expect(launchUrlFor({ type: "login", title: "X" })).toBeNull();
    expect(launchUrlFor({ type: "login", title: "X", uri: "   " })).toBeNull();
  });

  it("refuses a javascript: uri, which would otherwise be a stored XSS", () => {
    expect(
      launchUrlFor({ type: "login", title: "X", uri: "javascript:alert(1)" }),
    ).toBeNull();
  });

  it("refuses other non-web schemes", () => {
    expect(launchUrlFor({ type: "login", title: "X", uri: "file:///etc/passwd" })).toBeNull();
    expect(launchUrlFor({ type: "login", title: "X", uri: "data:text/html,x" })).toBeNull();
  });

  it("returns null for notes and cards", () => {
    expect(launchUrlFor({ type: "note", title: "N" })).toBeNull();
    expect(launchUrlFor({ type: "card", title: "C" })).toBeNull();
  });
});
