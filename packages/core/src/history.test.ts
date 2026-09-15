import { describe, expect, it } from "vitest";

import { clearHistory, historyCount, recordPasswordChange } from "./history";
import { HISTORY_LIMIT, type Item, type LoginItem } from "./schema";

const NOW = new Date("2026-09-15T12:00:00.000Z");

const login = (password?: string, history?: LoginItem["history"]): LoginItem => ({
  type: "login",
  title: "GitHub",
  password,
  history,
});

describe("recordPasswordChange", () => {
  it("remembers the old password when it changes", () => {
    const result = recordPasswordChange(login("old"), login("new"), NOW);
    expect(result.type).toBe("login");
    expect((result as LoginItem).history).toEqual([
      { password: "old", changedAt: NOW.toISOString() },
    ]);
  });

  it("records nothing when the password is unchanged", () => {
    const result = recordPasswordChange(login("same"), login("same"), NOW);
    expect((result as LoginItem).history).toBeUndefined();
  });

  it("records nothing when there was no old password", () => {
    // A brand new item has nothing worth a slot.
    const result = recordPasswordChange(login(undefined), login("first"), NOW);
    expect((result as LoginItem).history).toBeUndefined();
  });

  it("puts the newest entry first", () => {
    const first = recordPasswordChange(login("a"), login("b"), NOW);
    const later = new Date("2026-09-16T12:00:00.000Z");
    const second = recordPasswordChange(
      login("b", (first as LoginItem).history),
      login("c", (first as LoginItem).history),
      later,
    );
    expect((second as LoginItem).history?.map((h) => h.password)).toEqual(["b", "a"]);
  });

  it("caps the list", () => {
    let item = login("p0");
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) {
      const next = login(`p${i}`, item.history);
      item = recordPasswordChange(item, next, NOW) as LoginItem;
    }
    expect(item.history).toHaveLength(HISTORY_LIMIT);
    // The oldest entries fell off the end, not the newest.
    expect(item.history?.[0]?.password).toBe(`p${HISTORY_LIMIT + 4}`);
  });

  it("does not keep the same old password twice", () => {
    // Reverted, then changed again. Without dedupe this burns two of ten slots
    // on one value.
    const a = recordPasswordChange(login("x"), login("y"), NOW) as LoginItem;
    const b = recordPasswordChange(login("y", a.history), login("x", a.history), NOW) as LoginItem;
    const c = recordPasswordChange(login("x", b.history), login("z", b.history), NOW) as LoginItem;
    expect(c.history?.filter((h) => h.password === "x")).toHaveLength(1);
  });

  it("leaves non-login types alone", () => {
    const note: Item = { type: "note", title: "N", body: "b" };
    expect(recordPasswordChange(note, note, NOW)).toEqual(note);
  });
});

describe("historyCount", () => {
  it("counts entries", () => {
    expect(historyCount(login("a", [{ password: "b", changedAt: "x" }]))).toBe(1);
    expect(historyCount(login("a"))).toBe(0);
    expect(historyCount({ type: "card", title: "C" })).toBe(0);
  });
});

describe("clearHistory", () => {
  it("removes the list entirely", () => {
    const item = login("a", [{ password: "b", changedAt: "x" }]);
    const cleared = clearHistory(item) as LoginItem;
    expect(cleared.history).toBeUndefined();
    expect(cleared.password).toBe("a");
  });

  it("is a no-op on other types", () => {
    const card: Item = { type: "card", title: "C" };
    expect(clearHistory(card)).toEqual(card);
  });
});
