import type { Item } from "@passio/core/schema";

import type {
  FillField,
  ItemSummary,
  OutboundRequest,
  Response,
  VaultState,
} from "./messages";

async function send(req: OutboundRequest): Promise<Response> {
  try {
    const res: Response = await chrome.runtime.sendMessage(req);
    return res;
  } catch {
    // No receiver at all: the offscreen document is gone and could not be
    // recreated. Degrade to locked rather than showing a broken popup.
    return { ok: false, error: "The vault is locked." };
  }
}

/** The success half of Response. The failure variant has no `kind`, so keying a
 *  generic on Response["kind"] does not typecheck. */
type Ok = Extract<Response, { ok: true }>;

/**
 * Turns a failed reply into a thrown Error and proves the reply is the one that
 * was asked for. A mismatched kind means the protocol has drifted, which is a
 * bug worth failing loudly rather than reading a missing field as undefined.
 */
function expectKind<K extends Ok["kind"]>(
  res: Response,
  kind: K,
): Extract<Ok, { kind: K }> {
  if (!res.ok) throw new Error(res.error);
  if (res.kind !== kind) throw new Error("Unexpected reply from the vault.");
  return res as Extract<Ok, { kind: K }>;
}

export const vault = {
  async status(): Promise<VaultState> {
    const res = await send({ target: "offscreen", kind: "status" });
    return res.ok && res.kind === "status" ? res.state : "locked";
  },

  async unlock(email: string, password: string): Promise<void> {
    expectKind(await send({ target: "offscreen", kind: "unlock", email, password }), "unlock");
  },

  async lock(): Promise<void> {
    await send({ target: "offscreen", kind: "lock" });
  },

  async signOut(): Promise<void> {
    await send({ target: "offscreen", kind: "signOut" });
  },

  async items(): Promise<{ items: ItemSummary[]; damaged: number }> {
    const res = expectKind(await send({ target: "offscreen", kind: "items" }), "items");
    return { items: res.items, damaged: res.damaged };
  },

  // --- full-vault operations, used only by the editor page ---

  async itemsFull() {
    const res = expectKind(
      await send({ target: "offscreen", kind: "itemsFull" }), "itemsFull",
    );
    return { items: res.items, damaged: res.damaged };
  },

  async deletedItems() {
    const res = expectKind(
      await send({ target: "offscreen", kind: "deletedItems" }), "deletedItems",
    );
    return { items: res.items, damaged: res.damaged };
  },

  async folders() {
    return expectKind(
      await send({ target: "offscreen", kind: "folders" }), "folders",
    ).folders;
  },

  async saveItem(id: string, item: Item, isNew: boolean): Promise<void> {
    expectKind(
      await send({ target: "offscreen", kind: "saveItem", id, item, isNew }),
      "saveItem",
    );
  },

  async deleteItem(id: string): Promise<void> {
    expectKind(await send({ target: "offscreen", kind: "deleteItem", id }), "deleteItem");
  },

  async restoreItem(id: string): Promise<void> {
    expectKind(
      await send({ target: "offscreen", kind: "restoreItem", id }), "restoreItem",
    );
  },

  async saveFolder(id: string, name: string, isNew: boolean): Promise<void> {
    expectKind(
      await send({ target: "offscreen", kind: "saveFolder", id, name, isNew }),
      "saveFolder",
    );
  },

  async deleteFolder(id: string): Promise<void> {
    expectKind(
      await send({ target: "offscreen", kind: "deleteFolder", id }), "deleteFolder",
    );
  },

  async fieldValue(itemId: string, field: FillField): Promise<string> {
    return expectKind(
      await send({ target: "offscreen", kind: "fieldValue", itemId, field }),
      "fieldValue",
    ).value;
  },
};
