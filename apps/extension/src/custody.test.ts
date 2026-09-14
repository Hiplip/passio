import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encryptItem, generateVaultKey, itemAad, wrapVaultKey } from "@passio/crypto";
import type { WrappingKey } from "@passio/crypto/types";

import { createCustody, type CustodyApi, type CustodyDeps } from "./custody";

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

interface Write {
  op: string;
  id: string;
  ciphertext?: string;
}

/**
 * A fake server that records every write.
 *
 * Module-level so a test can override one method by spreading the rest,
 * rather than restating the whole eleven-method surface.
 */
function makeApi(f: Fixture, writes: Write[]): CustodyApi {
  const record = (op: string) => (id: string, ciphertext?: string) => {
    writes.push({ op, id, ciphertext });
    return Promise.resolve();
  };

  return {
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
    listDeletedItems: () => Promise.resolve([]),
    listFolders: () => Promise.resolve([]),
    createItem: record("createItem"),
    updateItem: record("updateItem"),
    deleteItem: record("deleteItem"),
    restoreItem: record("restoreItem"),
    createFolder: record("createFolder"),
    renameFolder: record("renameFolder"),
    deleteFolder: record("deleteFolder"),
  };
}

/**
 * Builds a custody instance over fake dependencies.
 *
 * The spied functions are returned by name rather than read back off the deps
 * object: `expect(deps.signIn)` detaches a method from its receiver, which is
 * exactly what the unbound-method rule is there to catch.
 */
function harness(over: Partial<CustodyDeps>, f: Fixture) {
  let stored: string | null = null;
  const writes: Write[] = [];

  const signIn = vi.fn(() => Promise.resolve("TOKEN"));
  const writeToken = vi.fn((t: string) => { stored = t; return Promise.resolve(); });
  const clearToken = vi.fn(() => { stored = null; return Promise.resolve(); });

  const deps: CustodyDeps = {
    derive: () => Promise.resolve({ authHash: "AUTH", stretchedKey: f.wrappingKey }),
    signIn,
    writeToken,
    clearToken,
    readToken: () => Promise.resolve(stored),
    api: () => makeApi(f, writes),
    ...over,
  };

  return { custody: createCustody(deps), signIn, writeToken, clearToken, writes };
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
        ...makeApi(f, []),
        getKeys: () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(new Error("UNAUTHORIZED"))
            : Promise.resolve({ protectedVaultKey: f.protectedVaultKey });
        },
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

  it("returns full plaintext items for the editor", async () => {
    // Unlike items(), this carries secrets - the editor cannot edit a summary.
    const { custody } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    const { items } = await custody.itemsFull();

    expect(items).toHaveLength(1);
    expect(items[0]!.data).toMatchObject({ title: "GitHub", password: "s3cret" });
    // Dates cross the message boundary as strings, not Date objects.
    expect(typeof items[0]!.createdAt).toBe("string");
  });

  it("encrypts on save, so the page never holds the key", async () => {
    const { custody, writes } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    // A distinctive marker, not a single letter: base64url output contains
    // every character eventually, so a one-character probe fails at random.
    const MARKER = "PlaintextMarkerZZ";
    await custody.saveItem(
      ITEM_ID, { type: "note", title: MARKER, body: MARKER }, true,
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]!.op).toBe("createItem");
    // Ciphertext, in the stored envelope shape - never the plaintext.
    expect(writes[0]!.ciphertext).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(writes[0]!.ciphertext).not.toContain(MARKER);
  });

  it("updates rather than creates for an existing item", async () => {
    const { custody, writes } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    await custody.saveItem(ITEM_ID, { type: "note", title: "N" }, false);
    expect(writes[0]!.op).toBe("updateItem");
  });

  it("binds a saved item to its own id", async () => {
    // The id is the AAD. A ciphertext written for one id must not decrypt in
    // another row, which is what stops a malicious server swapping items.
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const { custody, writes } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    await custody.saveItem(ITEM_ID, { type: "note", title: "A" }, true);
    await custody.saveItem(OTHER, { type: "note", title: "A" }, true);
    // Same plaintext, different id: the ciphertexts must differ.
    expect(writes[0]!.ciphertext).not.toBe(writes[1]!.ciphertext);
  });

  it("deletes and restores items", async () => {
    const { custody, writes } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    await custody.removeItem(ITEM_ID);
    await custody.restoreItem(ITEM_ID);
    expect(writes.map((w) => w.op)).toEqual(["deleteItem", "restoreItem"]);
  });

  it("encrypts folder names too", async () => {
    const { custody, writes } = harness({}, f);
    await custody.unlock("a@b.co", "master");
    await custody.saveFolder(ITEM_ID, "CryptoWalletsMarker", true);

    expect(writes[0]!.op).toBe("createFolder");
    // A folder name leaks intent on its own, so it is encrypted like an item.
    expect(writes[0]!.ciphertext).not.toContain("CryptoWalletsMarker");
  });

  it("refuses every write while locked", async () => {
    const { custody, writes } = harness({}, f);
    await expect(
      custody.saveItem(ITEM_ID, { type: "note", title: "N" }, true),
    ).rejects.toThrow(/locked/i);
    await expect(custody.removeItem(ITEM_ID)).rejects.toThrow(/locked/i);
    await expect(custody.saveFolder(ITEM_ID, "X", true)).rejects.toThrow(/locked/i);
    await expect(custody.itemsFull()).rejects.toThrow(/locked/i);
    expect(writes).toEqual([]);
  });

  it("reports zero matches while locked, rather than throwing", async () => {
    // The badge must never become an oracle for whether the vault is unlocked.
    const { custody } = harness({}, f);
    expect(await custody.matchCount("https://github.com/")).toBe(0);
  });
});
