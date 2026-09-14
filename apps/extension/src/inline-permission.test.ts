import { describe, expect, it } from "vitest";

import {
  dropInlineAccess,
  hasInlineAccess,
  INLINE_ORIGINS,
  requestInlineAccess,
  type PermissionApi,
} from "./inline-permission";

function fake(granted = false) {
  let held = granted;
  const calls: string[] = [];
  const api: PermissionApi = {
    contains: () => {
      calls.push("contains");
      return Promise.resolve(held);
    },
    request: () => {
      calls.push("request");
      held = true;
      return Promise.resolve(true);
    },
    remove: () => {
      calls.push("remove");
      held = false;
      return Promise.resolve(true);
    },
  };
  return { api, calls, held: () => held };
}

describe("inline permission", () => {
  it("asks for every origin, and nothing else", () => {
    // A narrower request would not let the icon appear before a click, and a
    // wider one does not exist. Naming it once keeps request and check in step.
    expect(INLINE_ORIGINS).toEqual({ origins: ["<all_urls>"] });
    expect(INLINE_ORIGINS.permissions).toBeUndefined();
  });

  it("reports absent by default", async () => {
    const { api } = fake();
    expect(await hasInlineAccess(api)).toBe(false);
  });

  it("reports present once granted", async () => {
    const { api } = fake(true);
    expect(await hasInlineAccess(api)).toBe(true);
  });

  it("grants on request", async () => {
    const { api, held } = fake();
    expect(await requestInlineAccess(api)).toBe(true);
    expect(held()).toBe(true);
  });

  it("gives it back", async () => {
    const { api, held } = fake(true);
    await dropInlineAccess(api);
    expect(held()).toBe(false);
  });

  it("never requests as a side effect of checking", async () => {
    // Chrome only shows the prompt from a user gesture; a check that quietly
    // requested would fail silently and look like a refusal.
    const { api, calls } = fake();
    await hasInlineAccess(api);
    expect(calls).toEqual(["contains"]);
  });
});
