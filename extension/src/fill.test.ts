// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fillField } from "./fill";

describe("fillField", () => {
  it("sets the value", () => {
    const el = document.createElement("input");
    fillField(el, "hunter2");
    expect(el.value).toBe("hunter2");
  });

  it("dispatches input then change, both bubbling", () => {
    const el = document.createElement("input");
    document.body.append(el);
    const seen: Array<[string, boolean]> = [];
    for (const type of ["input", "change"]) {
      el.addEventListener(type, (e) => seen.push([e.type, e.bubbles]));
    }
    fillField(el, "x");
    expect(seen).toEqual([
      ["input", true],
      ["change", true],
    ]);
  });

  it("bypasses an instance-level value setter, the way React installs one", () => {
    // React defines its own `value` accessor on the element and uses it to
    // track what it has already seen. Going through it marks the write as
    // already-known, and React overwrites the field on its next render - so
    // the fill silently disappears. Writing through the prototype's setter is
    // what makes it stick.
    const el = document.createElement("input");
    const proto = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!;

    let instanceSetterCalls = 0;
    Object.defineProperty(el, "value", {
      configurable: true,
      get: () => proto.get!.call(el) as string,
      set(v: string) {
        instanceSetterCalls += 1;
        proto.set!.call(el, v);
      },
    });

    fillField(el, "hunter2");

    expect(instanceSetterCalls).toBe(0);
    expect(proto.get!.call(el)).toBe("hunter2");
  });

  it("focuses the field, so frameworks tracking focus behave", () => {
    const el = document.createElement("input");
    document.body.append(el);
    fillField(el, "x");
    expect(document.activeElement).toBe(el);
  });

  it("does nothing to a null element", () => {
    expect(() => fillField(null, "x")).not.toThrow();
  });

  it("can clear a field", () => {
    const el = document.createElement("input");
    fillField(el, "something");
    fillField(el, "");
    expect(el.value).toBe("");
  });
});
