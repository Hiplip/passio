import { itemSchema, type ItemType, type UriEntry } from "@passio/core/schema";
import { z } from "zod";

/**
 * Everything that crosses an extension message boundary, validated on arrival.
 *
 * chrome.runtime.sendMessage broadcasts to EVERY other extension context at
 * once, so two fields are needed to make delivery unambiguous:
 *
 * - `target` says which listener the message is for.
 * - `via: "background"` marks a message the service worker has forwarded.
 *   Without it the offscreen document also hears the popup's original
 *   broadcast and handles the same request twice - two Argon2id runs per
 *   unlock, two sign-ins, two vault decryptions - while the background
 *   forwards a copy that would loop straight back into its own listener.
 *
 * Senders outside the service worker omit `via`, so the offscreen document
 * ignores them and answers only the forwarded copy.
 */
const via = z.literal("background");
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("status") }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("unlock"),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("lock") }),
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("signOut") }),
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("items") }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("matchCount"),
    url: z.string(),
  }),
  // Full-vault operations. The popup never sends these; only the editor page
  // does, and only it receives plaintext items back.
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("heartbeat") }),
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("itemsFull") }),
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("deletedItems") }),
  z.object({ target: z.literal("offscreen"), via, kind: z.literal("folders") }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("saveItem"),
    id: z.string().uuid(),
    item: itemSchema,
    isNew: z.boolean(),
  }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("deleteItem"),
    id: z.string().uuid(),
  }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("restoreItem"),
    id: z.string().uuid(),
  }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("saveFolder"),
    id: z.string().uuid(),
    name: z.string().trim().min(1),
    isNew: z.boolean(),
  }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("deleteFolder"),
    id: z.string().uuid(),
  }),
  z.object({
    target: z.literal("offscreen"),
    via,
    kind: z.literal("fieldValue"),
    itemId: z.string().uuid(),
    // The fill path turns this into a value typed into a page. It is the last
    // place to accept "whatever the caller said".
    field: z.enum(["username", "password", "totp"]),
  }),
  z.object({
    target: z.literal("offscreen"),
    via,
    // Card and identity values for one item, keyed by form role. A separate
    // kind rather than widening `field` above, so that enum stays narrow.
    kind: z.literal("fillValues"),
    itemId: z.string().uuid(),
  }),
]);

export type Request = z.infer<typeof requestSchema>;

/**
 * What the popup and the alarm build: the same message without `via`, which
 * only the service worker is allowed to add.
 *
 * Omit must DISTRIBUTE over the union. A plain `Omit<Request, "via">` collapses
 * every variant into their common keys, so `email` and `itemId` disappear and
 * the discriminant stops narrowing.
 */
type WithoutVia<T> = T extends unknown ? Omit<T, "via"> : never;
export type OutboundRequest = WithoutVia<Request>;

/** Stamps a request as forwarded. Only the service worker calls this. */
export function forwarded(req: OutboundRequest): Request {
  return { ...req, via: "background" };
}

/**
 * Messages the OFFSCREEN document sends to the service worker.
 *
 * `chrome.runtime` is the only extension API an offscreen document has. It
 * cannot touch chrome.storage at all - reading it throws "Cannot read
 * properties of undefined". So the document that holds the vault key asks the
 * service worker to read and write the session token on its behalf.
 *
 * The token is the only thing proxied. The vault key never crosses this
 * boundary, or any other.
 */
const backgroundRequestSchema = z.discriminatedUnion("kind", [
  z.object({ target: z.literal("background"), kind: z.literal("tokenRead") }),
  z.object({
    target: z.literal("background"),
    kind: z.literal("tokenWrite"),
    token: z.string().min(1),
  }),
  z.object({ target: z.literal("background"), kind: z.literal("tokenClear") }),
  /**
   * Sent by the suggestion iframe when someone picks an entry.
   *
   * The iframe never receives the password. It names an item; the service
   * worker resolves the values from the offscreen document and relays them to
   * the content script in the iframe's own tab, which the worker knows from
   * `sender.tab` and the iframe cannot forge.
   */
  z.object({
    target: z.literal("background"),
    kind: z.literal("inlineFill"),
    itemId: z.string().uuid(),
  }),
  /**
   * The suggestion iframe reporting how tall its content actually is.
   *
   * Estimating this from a match count was always going to be wrong somewhere:
   * a notice that wraps to two lines does not fit a one-line box, and the
   * iframe then grows its own scrollbar inside a panel that is already small.
   * Measuring is exact, and the iframe is the only thing that can measure it.
   */
  z.object({
    target: z.literal("background"),
    kind: z.literal("inlineResize"),
    height: z.number().int().positive().max(2000),
  }),
]);

export type BackgroundRequest = z.infer<typeof backgroundRequestSchema>;

export type BackgroundResponse =
  | { ok: true; kind: "tokenRead"; token: string | null }
  | { ok: true; kind: "tokenWrite" }
  | { ok: true; kind: "tokenClear" }
  | { ok: true; kind: "inlineFill"; outcome: "filled" | "no-form" }
  | { ok: true; kind: "inlineResize" }
  | { ok: false; error: string };

export function parseBackgroundRequest(value: unknown): BackgroundRequest | null {
  const parsed = backgroundRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
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
  type: ItemType;
  username?: string;
  /** Legacy single address, kept so old items still match. */
  uri?: string;
  /** Addresses with explicit match modes, so the popup matches exactly as the
   *  web app does. Carries no secret - an address is not one. */
  uris?: UriEntry[];
  hasTotp: boolean;
  /** For the folder filter. A UUID with no meaning outside the vault, and far
   *  less revealing than the title beside it. */
  folderId?: string;
}

/** A decrypted item as the editor page needs it. Dates cross the message
 *  boundary as ISO strings: structured clone would keep Date objects, but the
 *  reply is JSON to every other reader. */
export interface FullItem {
  id: string;
  data: z.infer<typeof itemSchema>;
  createdAt: string;
  updatedAt: string;
}

export interface FolderSummary {
  id: string;
  name: string;
}

export type Response =
  | { ok: true; kind: "status"; state: VaultState }
  | { ok: true; kind: "unlock" }
  | { ok: true; kind: "lock" }
  | { ok: true; kind: "signOut" }
  | { ok: true; kind: "items"; items: ItemSummary[]; damaged: number }
  | { ok: true; kind: "matchCount"; count: number }
  | { ok: true; kind: "fieldValue"; value: string }
  | { ok: true; kind: "fillValues"; values: Record<string, string> }
  | { ok: true; kind: "heartbeat"; count: number }
  | { ok: true; kind: "itemsFull"; items: FullItem[]; damaged: string[] }
  | { ok: true; kind: "deletedItems"; items: FullItem[]; damaged: string[] }
  | { ok: true; kind: "folders"; folders: FolderSummary[] }
  | { ok: true; kind: "saveItem" }
  | { ok: true; kind: "deleteItem" }
  | { ok: true; kind: "restoreItem" }
  | { ok: true; kind: "saveFolder" }
  | { ok: true; kind: "deleteFolder" }
  | { ok: false; error: string };

export function parseRequest(value: unknown): Request | null {
  const parsed = requestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
