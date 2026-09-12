import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearToken, readToken, writeToken, type TokenStore } from "./auth";

function fakeStore(): TokenStore {
  let value: string | undefined;
  return {
    get: vi.fn(() => Promise.resolve(value)),
    set: vi.fn((v: string) => { value = v; return Promise.resolve(); }),
    remove: vi.fn(() => { value = undefined; return Promise.resolve(); }),
  };
}

describe("token storage", () => {
  let store: TokenStore;
  beforeEach(() => { store = fakeStore(); });

  it("round-trips a token", async () => {
    await writeToken(store, "abc123");
    expect(await readToken(store)).toBe("abc123");
  });

  it("returns null when nothing is stored", async () => {
    expect(await readToken(store)).toBeNull();
  });

  it("clears the token", async () => {
    await writeToken(store, "abc123");
    await clearToken(store);
    expect(await readToken(store)).toBeNull();
  });

  it("treats an empty string as absent", async () => {
    // A blank Authorization header reads as "signed in" and then fails every
    // call with a confusing 401 rather than showing the sign-in screen.
    await writeToken(store, "");
    expect(await readToken(store)).toBeNull();
  });
});
