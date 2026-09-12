import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encryptItem, generateVaultKey, itemAad, wrapVaultKey } from "@passio/crypto";
import type { WrappingKey } from "@passio/crypto/types";

import { createCustody, type CustodyDeps } from "./custody";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

/** A real AES-GCM key standing in for a derived one. These tests cover the
 *  custody state machine, not the KDF - packages/crypto already covers that,
 *  and running Argon2id here would add a second per assertion. */
async function fakeWrappingKey(): Promise<WrappingKey> {
  return (await webcrypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )) as WrappingKey;
}

async function fixture() {
  const wrappingKey = await fakeWrappingKey();
  const vaultKey = await generateVaultKey();
  const protectedVaultKey = await wrapVaultKey(vaultKey, wrappingKey, "master");
  const ciphertext = await encryptItem(
    {
      type: "login",
      title: "GitHub",
      username: "ada",
      password: "s3cret",
      uri: "https://github.com/login",
    },
    vaultKey,
    itemAad(ITEM_ID),
  );
  return { wrappingKey, protectedVaultKey, ciphertext };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/**
 * Builds a custody instance over fake dependencies.
 *
 * The spied functions are returned by name rather than read back off the deps
 * object: `expect(deps.signIn)` detaches a method from its receiver, which is
 * exactly what the unbound-method rule is there to catch.
 */
function harness(over: Partial<CustodyDeps>, f: Fixture) {
  let stored: string | null = null;

  const signIn = vi.fn(() => Promise.resolve("TOKEN"));
  const writeToken = vi.fn((t: string) => { stored = t; return Promise.resolve(); });
  const clearToken = vi.fn(() => { stored = null; return Promise.resolve(); });

  const deps: CustodyDeps = {
    derive: () => Promise.resolve({ authHash: "AUTH", stretchedKey: f.wrappingKey }),
    signIn,
    writeToken,
    clearToken,
    readToken: () => Promise.resolve(stored),
    api: () => ({
      getKeys: () => Promise.resolve({ protectedVaultKey: f.protectedVaultKey }),
      listItems: () =>
        Promise.resolve([
          {
            id: ITEM_ID,
            ciphertext: f.ciphertext,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
    }),
    ...over,
  };

  return { custody: createCustody(deps), signIn, writeToken, clearToken };
}

describe("custody", () => {
  let f: Fixture;
  beforeEach(async () => { f = await fixture(); });

  it("starts signed out when there is no token", async () => {
    expect(await harness({}, f).custody.status()).toBe("signed-out");
  });

  it("reports locked when a token exists but no key is held", async () => {
    const { custody } = harness({ readToken: () => Promise.resolve("TOKEN") }, f);
    expect(await custody.status()).toBe("locked");
  });

  it("unlocks and reports unlocked", async () => {
    const { custody } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    expect(await custody.status()).toBe("unlocked");
  });

  it("signs in when there is no token, and stores it", async () => {
    const { custody, signIn, writeToken } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    expect(signIn).toHaveBeenCalledOnce();
    expect(writeToken).toHaveBeenCalledWith("TOKEN");
  });

  it("skips sign-in when a stored token still works", async () => {
    const { custody, signIn } = harness(
      { readToken: () => Promise.resolve("EXISTING") }, f,
    );
    await custody.unlock("a@b.co", "master");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("re-signs-in exactly once when the stored token is rejected", async () => {
    let calls = 0;
    const { custody, signIn } = harness({
      readToken: () => Promise.resolve("STALE"),
      api: () => ({
        getKeys: () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(new Error("UNAUTHORIZED"))
            : Promise.resolve({ protectedVaultKey: f.protectedVaultKey });
        },
        listItems: () => Promise.resolve([]),
      }),
    }, f);
    await custody.unlock("a@b.co", "master");
    expect(signIn).toHaveBeenCalledOnce();
    expect(await custody.status()).toBe("unlocked");
  });

  it("returns item summaries that carry no secrets", async () => {
    const { custody } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    const { items } = await custody.items();

    expect(items).toEqual([{
      id: ITEM_ID,
      title: "GitHub",
      type: "login",
      username: "ada",
      uri: "https://github.com/login",
      hasTotp: false,
    }]);
    // The whole point of ItemSummary: no password reaches the popup.
    expect(JSON.stringify(items)).not.toContain("s3cret");
  });

  it("hands over a single field only when asked", async () => {
    const { custody } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    expect(await custody.fieldValue(ITEM_ID, "password")).toBe("s3cret");
    expect(await custody.fieldValue(ITEM_ID, "username")).toBe("ada");
  });

  it("returns an empty field rather than throwing when absent", async () => {
    const { custody } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    expect(await custody.fieldValue(ITEM_ID, "totp")).toBe("");
  });

  it("refuses every operation while locked", async () => {
    const { custody } = harness({}, f);
    await expect(custody.items()).rejects.toThrow(/locked/i);
    await expect(custody.fieldValue(ITEM_ID, "password")).rejects.toThrow(/locked/i);
  });

  it("forgets the key on lock", async () => {
    const { custody } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    custody.lock();
    expect(await custody.status()).toBe("locked");
    await expect(custody.items()).rejects.toThrow(/locked/i);
  });

  it("keeps the session token when locking", async () => {
    // Locking is not signing out. Clearing the token here would mean retyping
    // the email after every idle timeout.
    const { custody, clearToken } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    custody.lock();
    expect(clearToken).not.toHaveBeenCalled();
    expect(await custody.status()).toBe("locked");
  });

  it("drops both key and token on sign out", async () => {
    const { custody, clearToken } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    await custody.signOut();
    expect(clearToken).toHaveBeenCalled();
    expect(await custody.status()).toBe("signed-out");
  });

  it("holds no key after a failed unlock", async () => {
    const wrong = await fakeWrappingKey();
    const { custody } = harness({
      derive: () => Promise.resolve({ authHash: "AUTH", stretchedKey: wrong }),
    }, f);
    await expect(custody.unlock("a@b.co", "wrong")).rejects.toThrow();
    expect(await custody.status()).toBe("locked");
  });

  it("counts matches for the current page", async () => {
    const { custody } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    expect(await custody.matchCount("https://github.com/settings")).toBe(1);
    expect(await custody.matchCount("https://example.com/")).toBe(0);
  });

  it("reports zero matches while locked, rather than throwing", async () => {
    // The badge must never become an oracle for whether the vault is unlocked.
    const { custody } = harness({}, f);
    expect(await custody.matchCount("https://github.com/")).toBe(0);
  });
});
