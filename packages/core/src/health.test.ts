import { describe, expect, it } from "vitest";

import { analyseVault, healthScore } from "./health";
import type { DecryptedItem } from "./decrypt-vault";
import type { Item } from "./schema";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const RECENT = new Date("2026-09-01T12:00:00.000Z");
const ANCIENT = new Date("2020-01-01T12:00:00.000Z");

const item = (id: string, data: Item, updatedAt = RECENT): DecryptedItem => ({
  id,
  data,
  createdAt: RECENT,
  updatedAt,
});

const login = (id: string, password?: string, extra: Partial<Item> = {}) =>
  item(id, { type: "login", title: id, password, ...extra });

describe("weak passwords", () => {
  it("finds them and sorts the worst first", () => {
    const report = analyseVault(
      [login("a", "K7#mQ2$vL9!pX4&z"), login("b", "password"), login("c", "aB3$")],
      NOW,
    );
    expect(report.weak.map((w) => w.id)).toEqual(["b", "c"]);
    expect(report.weak[0]!.score).toBeLessThanOrEqual(report.weak[1]!.score);
  });

  it("says why, so the finding is actionable", () => {
    const report = analyseVault([login("a", "password")], NOW);
    expect(report.weak[0]?.notes.length).toBeGreaterThan(0);
  });

  it("ignores an item with no password", () => {
    const report = analyseVault([item("n", { type: "note", title: "N" })], NOW);
    expect(report.weak).toEqual([]);
    expect(report.checked).toBe(0);
  });
});

describe("reuse", () => {
  it("groups items sharing a password", () => {
    const report = analyseVault(
      [login("a", "sameOne!23"), login("b", "sameOne!23"), login("c", "different!45")],
      NOW,
    );
    expect(report.reused).toHaveLength(1);
    expect(report.reused[0]?.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("never returns the password itself", () => {
    // A report that listed them would be a plaintext dump of the vault.
    const report = analyseVault([login("a", "shared!23"), login("b", "shared!23")], NOW);
    expect(JSON.stringify(report)).not.toContain("shared!23");
  });

  it("sorts the biggest group first", () => {
    const report = analyseVault(
      [
        login("a", "one!234"),
        login("b", "one!234"),
        login("c", "one!234"),
        login("d", "two!234"),
        login("e", "two!234"),
      ],
      NOW,
    );
    expect(report.reused[0]?.items).toHaveLength(3);
  });

  it("finds reuse across different item types", () => {
    // The same password on a login and a database is still reuse.
    const report = analyseVault(
      [
        login("a", "shared!23"),
        item("b", { type: "database", title: "db", password: "shared!23" }),
      ],
      NOW,
    );
    expect(report.reused[0]?.items).toHaveLength(2);
  });

  it("reports nothing when every password is distinct", () => {
    expect(analyseVault([login("a", "one!234"), login("b", "two!234")], NOW).reused).toEqual([]);
  });
});

describe("age", () => {
  it("finds a password older than the limit", () => {
    const report = analyseVault([login("old", "K7#mQ2$vL9!pX4&z")], NOW, 365);
    expect(report.old).toEqual([]);

    const ancient = analyseVault(
      [item("old", { type: "login", title: "old", password: "K7#mQ2$vL9!pX4&z" }, ANCIENT)],
      NOW,
      365,
    );
    expect(ancient.old.map((o) => o.id)).toEqual(["old"]);
    expect(ancient.old[0]!.days).toBeGreaterThan(2000);
  });

  it("uses password history over updatedAt", () => {
    // Renaming an item bumps updatedAt. Without history the password would look
    // freshly rotated when it is years old - or the reverse.
    const report = analyseVault(
      [
        item(
          "a",
          {
            type: "login",
            title: "a",
            password: "K7#mQ2$vL9!pX4&z",
            history: [{ password: "older", changedAt: ANCIENT.toISOString() }],
          },
          NOW,
        ),
      ],
      NOW,
      365,
    );
    expect(report.old.map((o) => o.id)).toEqual(["a"]);
  });

  it("ignores an unparseable history date rather than throwing", () => {
    const report = analyseVault(
      [
        item(
          "a",
          {
            type: "login",
            title: "a",
            password: "K7#mQ2$vL9!pX4&z",
            history: [{ password: "x", changedAt: "not a date" }],
          },
          RECENT,
        ),
      ],
      NOW,
      365,
    );
    expect(report.old).toEqual([]);
  });
});

describe("unsecured addresses", () => {
  it("finds an http address", () => {
    const report = analyseVault(
      [login("a", "K7#mQ2$vL9!pX4&z", { uris: [{ uri: "http://example.com", match: "domain" }] })],
      NOW,
    );
    expect(report.unsecured.map((u) => u.id)).toEqual(["a"]);
  });

  it("ignores https", () => {
    const report = analyseVault(
      [login("a", "K7#mQ2$vL9!pX4&z", { uris: [{ uri: "https://example.com", match: "domain" }] })],
      NOW,
    );
    expect(report.unsecured).toEqual([]);
  });

  it("ignores an address the user silenced", () => {
    const report = analyseVault(
      [login("a", "K7#mQ2$vL9!pX4&z", { uris: [{ uri: "http://old.example", match: "never" }] })],
      NOW,
    );
    expect(report.unsecured).toEqual([]);
  });

  it("reads the legacy single address too", () => {
    const report = analyseVault([login("a", "K7#mQ2$vL9!pX4&z", { uri: "http://legacy.example" })], NOW);
    expect(report.unsecured).toHaveLength(1);
  });
});

describe("healthScore", () => {
  it("is 100 for an empty vault", () => {
    expect(healthScore(analyseVault([], NOW))).toBe(100);
  });

  it("is 100 for a vault of strong, distinct, fresh passwords", () => {
    const report = analyseVault(
      [login("a", "K7#mQ2$vL9!pX4&z"), login("b", "plaster-mimosa-tundra-verbatim")],
      NOW,
    );
    expect(healthScore(report)).toBe(100);
  });

  it("drops when things are wrong", () => {
    const report = analyseVault([login("a", "password"), login("b", "password")], NOW);
    expect(healthScore(report)).toBeLessThan(60);
  });

  it("never goes below zero, even when everything is wrong at once", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      item("x" + i, { type: "login", title: "x", password: "password" }, ANCIENT),
    );
    expect(healthScore(analyseVault(items, NOW))).toBeGreaterThanOrEqual(0);
  });
});
