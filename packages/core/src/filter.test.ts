import { describe, expect, it } from "vitest";

import type { DecryptedItem } from "./decrypt-vault";
import {
  ALL_ITEMS,
  applyFilter,
  applySummaryFilter,
  countByFolder,
  countByType,
  countFilters,
  countItemFilters,
  countTotp,
  filtersEqual,
  type VaultFilter,
} from "./filter";

const now = new Date();
const make = (id: string, data: Record<string, unknown>): DecryptedItem =>
  ({ id, data, createdAt: now, updatedAt: now }) as DecryptedItem;

const WORK = "11111111-1111-4111-8111-111111111111";
const HOME = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

const items = [
  make("1", { type: "login", title: "GitHub", folderId: WORK }),
  make("2", { type: "login", title: "Bank", folderId: HOME }),
  make("3", { type: "note", title: "Wifi", folderId: HOME }),
  make("4", { type: "card", title: "Visa" }),
  make("5", { type: "login", title: "Orphan", folderId: GONE }),
];

const known = new Set([WORK, HOME]);

describe("applyFilter", () => {
  it("returns everything for 'all'", () => {
    expect(applyFilter(items, ALL_ITEMS, known)).toHaveLength(5);
  });

  it("filters by type", () => {
    expect(
      applyFilter(items, { kind: "type", type: "login" }, known).map((i) => i.id),
    ).toEqual(["1", "2", "5"]);
    expect(
      applyFilter(items, { kind: "type", type: "card" }, known).map((i) => i.id),
    ).toEqual(["4"]);
  });

  it("filters by folder", () => {
    expect(
      applyFilter(items, { kind: "folder", folderId: HOME }, known).map((i) => i.id),
    ).toEqual(["2", "3"]);
  });

  it("treats an item with no folder as unfiled", () => {
    expect(applyFilter(items, { kind: "unfiled" }, known).map((i) => i.id)).toContain("4");
  });

  it("treats an item pointing at a deleted folder as unfiled, not invisible", () => {
    // Deleting a folder cannot cascade to its items - the server cannot read
    // which items reference it - so those items must still be reachable.
    expect(applyFilter(items, { kind: "unfiled" }, known).map((i) => i.id)).toEqual([
      "4",
      "5",
    ]);
  });

  it("every item is reachable from some folder view", () => {
    const viaFolders = [WORK, HOME].flatMap((folderId) =>
      applyFilter(items, { kind: "folder", folderId }, known).map((i) => i.id),
    );
    const viaUnfiled = applyFilter(items, { kind: "unfiled" }, known).map((i) => i.id);
    expect(new Set([...viaFolders, ...viaUnfiled])).toEqual(
      new Set(items.map((i) => i.id)),
    );
  });

  it("returns nothing for a folder with no items", () => {
    const empty: VaultFilter = { kind: "folder", folderId: GONE };
    expect(applyFilter([items[0]!], empty, known)).toEqual([]);
  });
});

describe("filtersEqual", () => {
  it("matches identical filters", () => {
    expect(filtersEqual(ALL_ITEMS, { kind: "all" })).toBe(true);
    expect(
      filtersEqual({ kind: "type", type: "login" }, { kind: "type", type: "login" }),
    ).toBe(true);
    expect(
      filtersEqual({ kind: "folder", folderId: WORK }, { kind: "folder", folderId: WORK }),
    ).toBe(true);
  });

  it("distinguishes different filters of the same kind", () => {
    expect(
      filtersEqual({ kind: "type", type: "login" }, { kind: "type", type: "card" }),
    ).toBe(false);
    expect(
      filtersEqual({ kind: "folder", folderId: WORK }, { kind: "folder", folderId: HOME }),
    ).toBe(false);
  });

  it("distinguishes different kinds", () => {
    expect(filtersEqual(ALL_ITEMS, { kind: "unfiled" })).toBe(false);
  });
});

describe("counts", () => {
  it("counts items per folder, ignoring unfiled ones", () => {
    const counts = countByFolder(items);
    expect(counts.get(WORK)).toBe(1);
    expect(counts.get(HOME)).toBe(2);
    expect(counts.get("nope")).toBeUndefined();
  });

  it("counts items per type", () => {
    const counts = countByType(items);
    expect(counts.get("login")).toBe(3);
    expect(counts.get("note")).toBe(1);
    expect(counts.get("card")).toBe(1);
  });

  it("returns empty counts for an empty vault", () => {
    expect(countByFolder([]).size).toBe(0);
    expect(countByType([]).size).toBe(0);
  });
});

describe("trash", () => {
  it("passes the caller's list through unchanged", () => {
    // Trash is a different data source, not a subset of the live vault, so the
    // caller supplies the deleted rows and this kind does no filtering.
    const deleted = [make("d1", { type: "login", title: "Old" })];
    expect(applyFilter(deleted, { kind: "trash" }, known)).toEqual(deleted);
  });

  it("is distinguishable from every other filter", () => {
    expect(filtersEqual({ kind: "trash" }, ALL_ITEMS)).toBe(false);
    expect(filtersEqual({ kind: "trash" }, { kind: "unfiled" })).toBe(false);
    expect(filtersEqual({ kind: "trash" }, { kind: "trash" })).toBe(true);
  });
});

describe("verification codes", () => {
  const withCodes = [
    make("a", {
      type: "login",
      title: "GitHub",
      totp: { secret: "GEZDGNBVGY3TQOJQ" },
    }),
    make("b", { type: "login", title: "Bank" }),
    make("c", { type: "note", title: "Wifi" }),
  ];

  it("selects only logins that carry an authenticator secret", () => {
    expect(applyFilter(withCodes, { kind: "totp" }, known).map((i) => i.id)).toEqual([
      "a",
    ]);
  });

  it("counts them", () => {
    expect(countTotp(withCodes)).toBe(1);
    expect(countTotp([])).toBe(0);
  });

  it("never counts a non-login, even if it somehow carried a totp field", () => {
    const odd = [make("x", { type: "note", title: "N", totp: { secret: "AAAA" } })];
    expect(countTotp(odd)).toBe(0);
  });

  it("is distinguishable from the login type filter", () => {
    expect(filtersEqual({ kind: "totp" }, { kind: "type", type: "login" })).toBe(false);
    expect(filtersEqual({ kind: "totp" }, { kind: "totp" })).toBe(true);
  });
});


describe("applySummaryFilter", () => {
  const summaries = [
    { id: "a", type: "login" as const, folderId: "work", hasTotp: true },
    { id: "b", type: "login" as const, hasTotp: false },
    { id: "c", type: "note" as const, folderId: "work", hasTotp: false },
    { id: "d", type: "card" as const, folderId: "gone", hasTotp: false },
  ];
  const known = new Set(["work"]);
  const ids = (r: { id: string }[]) => r.map((i) => i.id);

  it("returns everything for the all filter", () => {
    expect(applySummaryFilter(summaries, { kind: "all" }, known)).toHaveLength(4);
  });

  it("filters by type", () => {
    expect(ids(applySummaryFilter(summaries, { kind: "type", type: "login" }, known)))
      .toEqual(["a", "b"]);
  });

  it("filters by folder", () => {
    expect(ids(applySummaryFilter(summaries, { kind: "folder", folderId: "work" }, known)))
      .toEqual(["a", "c"]);
  });

  it("treats a dangling folder id as unfiled, not invisible", () => {
    // Item "d" points at a folder that no longer exists. Losing sight of an
    // item is worse than misfiling it, and both clients must agree on that.
    expect(ids(applySummaryFilter(summaries, { kind: "unfiled" }, known)))
      .toEqual(["b", "d"]);
  });

  it("filters by one-time code", () => {
    expect(ids(applySummaryFilter(summaries, { kind: "totp" }, known))).toEqual(["a"]);
  });
});

describe("countFilters", () => {
  const known = new Set(["work", "home"]);
  const summaries = [
    { id: "a", type: "login" as const, folderId: "work", hasTotp: true },
    { id: "b", type: "login" as const, hasTotp: false },
    { id: "c", type: "note" as const, folderId: "work", hasTotp: false },
    { id: "d", type: "card" as const, folderId: "gone", hasTotp: false },
    { id: "e", type: "login" as const, folderId: "home", hasTotp: true },
  ];

  it("counts everything in one pass", () => {
    const counts = countFilters(summaries, known);
    expect(counts.total).toBe(5);
    expect(counts.totp).toBe(2);
    expect(counts.byType.get("login")).toBe(3);
    expect(counts.byType.get("note")).toBe(1);
    expect(counts.byType.get("card")).toBe(1);
    expect(counts.byFolder.get("work")).toBe(2);
    expect(counts.byFolder.get("home")).toBe(1);
  });

  it("counts a dangling folder id as unfiled, matching where the item is shown", () => {
    // "b" has no folder, "d" points at one that is gone. Both appear under
    // "No folder", so both must be counted there or the pill lies.
    const counts = countFilters(summaries, known);
    expect(counts.unfiled).toBe(2);
    expect(counts.byFolder.get("gone")).toBeUndefined();
  });

  it("agrees with applySummaryFilter for every filter", () => {
    const counts = countFilters(summaries, known);
    const size = (filter: VaultFilter) =>
      applySummaryFilter(summaries, filter, known).length;

    expect(counts.total).toBe(size({ kind: "all" }));
    expect(counts.totp).toBe(size({ kind: "totp" }));
    expect(counts.unfiled).toBe(size({ kind: "unfiled" }));
    for (const type of ["login", "note", "card"] as const) {
      expect(counts.byType.get(type) ?? 0).toBe(size({ kind: "type", type }));
    }
    for (const folderId of known) {
      expect(counts.byFolder.get(folderId) ?? 0).toBe(
        size({ kind: "folder", folderId }),
      );
    }
  });

  it("returns empty counts for an empty vault", () => {
    const counts = countFilters([], known);
    expect(counts.total).toBe(0);
    expect(counts.unfiled).toBe(0);
    expect(counts.byType.size).toBe(0);
  });
});

describe("countItemFilters", () => {
  it("matches the summary counts for the same vault", () => {
    const counts = countItemFilters(items, known);
    expect(counts.total).toBe(5);
    expect(counts.byType.get("login")).toBe(3);
    expect(counts.byFolder.get(WORK)).toBe(1);
    expect(counts.byFolder.get(HOME)).toBe(2);
    // "4" has no folder and "5" points at a deleted one.
    expect(counts.unfiled).toBe(2);
  });

  it("never counts a one-time code on a non-login", () => {
    const odd = [make("x", { type: "note", title: "N", totp: { secret: "AAAA" } })];
    expect(countItemFilters(odd, known).totp).toBe(0);
  });
});
