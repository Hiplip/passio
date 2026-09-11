import { describe, expect, it } from "vitest";

import { encryptItem, generateVaultKey, itemAad } from "~/lib/crypto";

import { decryptVault, type EncryptedRow } from "./decrypt-vault";

const now = new Date();

async function row(id: string, data: unknown, key: CryptoKey): Promise<EncryptedRow> {
  return {
    id,
    ciphertext: await encryptItem(data, key as never, itemAad(id)),
    createdAt: now,
    updatedAt: now,
  };
}

describe("decryptVault", () => {
  it("decrypts and validates every row", async () => {
    const key = await generateVaultKey();
    const rows = [
      await row("1", { type: "login", title: "A" }, key),
      await row("2", { type: "login", title: "B" }, key),
    ];

    const { items, damaged } = await decryptVault(rows, key);

    expect(items.map((i) => i.data.title)).toEqual(["A", "B"]);
    expect(damaged).toEqual([]);
  });

  it("decrypts every item type", async () => {
    const key = await generateVaultKey();
    const rows = [
      await row("1", { type: "login", title: "A" }, key),
      await row("2", { type: "note", title: "B", body: "text" }, key),
      await row("3", { type: "card", title: "C", number: "4111111111111111" }, key),
    ];

    const { items, damaged } = await decryptVault(rows, key);

    expect(items.map((i) => i.data.type)).toEqual(["login", "note", "card"]);
    expect(damaged).toEqual([]);
  });

  it("isolates a corrupt row and keeps the rest usable", async () => {
    const key = await generateVaultKey();
    const rows = [
      await row("good", { type: "login", title: "A" }, key),
      {
        id: "corrupt",
        ciphertext: "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBB",
        createdAt: now,
        updatedAt: now,
      },
    ];

    const { items, damaged } = await decryptVault(rows, key);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("good");
    expect(damaged).toEqual(["corrupt"]);
  });

  it("treats a row whose plaintext fails validation as damaged, not as a crash", async () => {
    const key = await generateVaultKey();
    // Valid ciphertext, but the plaintext has no title.
    const rows = [await row("bad-shape", { type: "login" }, key)];

    const { items, damaged } = await decryptVault(rows, key);

    expect(items).toEqual([]);
    expect(damaged).toEqual(["bad-shape"]);
  });

  it("rejects a row whose ciphertext was moved from another item", async () => {
    const key = await generateVaultKey();
    const original = await row("item-a", { type: "login", title: "Secret" }, key);

    // A malicious server copies item A's ciphertext into item B's row.
    const swapped: EncryptedRow = { ...original, id: "item-b" };

    const { items, damaged } = await decryptVault([swapped], key);

    // The AAD binds a ciphertext to its own id, so this must not decrypt.
    expect(items).toEqual([]);
    expect(damaged).toEqual(["item-b"]);
  });

  it("marks everything damaged when given the wrong key, rather than throwing", async () => {
    const key = await generateVaultKey();
    const otherKey = await generateVaultKey();
    const rows = [await row("1", { type: "login", title: "A" }, key)];

    const { items, damaged } = await decryptVault(rows, otherKey);

    expect(items).toEqual([]);
    expect(damaged).toEqual(["1"]);
  });

  it("returns empty results for an empty vault", async () => {
    expect(await decryptVault([], await generateVaultKey())).toEqual({
      items: [],
      damaged: [],
    });
  });

  it("preserves row order", async () => {
    const key = await generateVaultKey();
    const rows = [
      await row("3", { type: "login", title: "C" }, key),
      await row("1", { type: "login", title: "A" }, key),
      await row("2", { type: "login", title: "B" }, key),
    ];

    const { items } = await decryptVault(rows, key);
    expect(items.map((i) => i.id)).toEqual(["3", "1", "2"]);
  });
});
