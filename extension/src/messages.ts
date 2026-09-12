import { z } from "zod";

/**
 * Everything that crosses an extension message boundary, validated on arrival.
 *
 * `target` exists because chrome.runtime.sendMessage broadcasts to every
 * extension context at once: without it the background worker and the offscreen
 * document both answer the same message and whichever replies first wins, at
 * random.
 */
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ target: z.literal("offscreen"), kind: z.literal("status") }),
  z.object({
    target: z.literal("offscreen"),
    kind: z.literal("unlock"),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  z.object({ target: z.literal("offscreen"), kind: z.literal("lock") }),
  z.object({ target: z.literal("offscreen"), kind: z.literal("signOut") }),
  z.object({ target: z.literal("offscreen"), kind: z.literal("items") }),
  z.object({
    target: z.literal("offscreen"),
    kind: z.literal("matchCount"),
    url: z.string(),
  }),
  z.object({
    target: z.literal("offscreen"),
    kind: z.literal("fieldValue"),
    itemId: z.string().uuid(),
    // The fill path turns this into a value typed into a page. It is the last
    // place to accept "whatever the caller said".
    field: z.enum(["username", "password", "totp"]),
  }),
]);

export type Request = z.infer<typeof requestSchema>;
export type FillField = "username" | "password" | "totp";

export type VaultState = "signed-out" | "locked" | "unlocked";

/**
 * What the popup is allowed to know about an item without asking for a secret.
 *
 * Carries no password, no note body, no card number. The popup renders a list
 * from these and asks for a single value only when someone actually clicks copy
 * or fill - so the whole vault is never sitting decrypted in a second context.
 */
export interface ItemSummary {
  id: string;
  title: string;
  type: "login" | "note" | "card";
  username?: string;
  uri?: string;
  hasTotp: boolean;
}

export type Response =
  | { ok: true; kind: "status"; state: VaultState }
  | { ok: true; kind: "unlock" }
  | { ok: true; kind: "lock" }
  | { ok: true; kind: "signOut" }
  | { ok: true; kind: "items"; items: ItemSummary[]; damaged: number }
  | { ok: true; kind: "matchCount"; count: number }
  | { ok: true; kind: "fieldValue"; value: string }
  | { ok: false; error: string };

export function parseRequest(value: unknown): Request | null {
  const parsed = requestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
