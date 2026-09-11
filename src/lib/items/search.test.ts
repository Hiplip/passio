import { describe, expect, it } from "vitest";

import type { DecryptedItem } from "./decrypt-vault";
import { searchItems } from "./search";

const now = new Date();
const make = (id: string, data: Record<string, unknown>): DecryptedItem =>
  ({ id, data, createdAt: now, updatedAt: now }) as DecryptedItem;

const items = [
  make("1", {
    type: "login",
    title: "GitHub",
    username: "me@example.com",
    uri: "https://github.com",
  }),
  make("2", {
    type: "login",
    title: "Bank",
    username: "acct-9931",
    uri: "https://bank.example",
  }),
  make("3", { type: "login", title: "GitLab", username: "me@example.com" }),
  make("4", { type: "note", title: "Wifi", body: "the passphrase is swordfish" }),
  make("5", { type: "card", title: "Visa", number: "4111111111111111" }),
];

describe("searchItems", () => {
  it("returns everything for an empty query", () => {
    expect(searchItems(items, "")).toHaveLength(items.length);
    expect(searchItems(items, "   ")).toHaveLength(items.length);
  });

  it("matches on title, case-insensitively", () => {
    expect(searchItems(items, "git").map((i) => i.id)).toEqual(["1", "3"]);
    expect(searchItems(items, "GITHUB").map((i) => i.id)).toEqual(["1"]);
  });

  it("matches on username", () => {
    expect(searchItems(items, "9931").map((i) => i.id)).toEqual(["2"]);
  });

  it("matches on uri", () => {
    expect(searchItems(items, "bank.example").map((i) => i.id)).toEqual(["2"]);
  });

  it("returns nothing when there is no match", () => {
    expect(searchItems(items, "nonexistent")).toEqual([]);
  });

  it("never matches on a password", () => {
    const withPassword = [make("x", { type: "login", title: "X", password: "supersecret" })];
    expect(searchItems(withPassword, "supersecret")).toEqual([]);
  });

  it("never matches on note contents", () => {
    expect(searchItems(items, "swordfish")).toEqual([]);
  });

  it("never matches on a card number or cvv", () => {
    expect(searchItems(items, "4111")).toEqual([]);
    const withCvv = [make("y", { type: "card", title: "Y", cvv: "123" })];
    expect(searchItems(withCvv, "123")).toEqual([]);
  });

  it("never matches on a totp secret", () => {
    const withTotp = [
      make("z", { type: "login", title: "Z", totp: { secret: "GEZDGNBVGY3TQOJQ" } }),
    ];
    expect(searchItems(withTotp, "GEZDGNBV")).toEqual([]);
  });

  it("trims the query", () => {
    expect(searchItems(items, "  github  ").map((i) => i.id)).toEqual(["1"]);
  });
});
