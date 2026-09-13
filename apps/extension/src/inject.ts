import { z } from "zod";

import { findLoginFields } from "./fields";
import { fillField } from "./fill";

/**
 * What the content script is allowed to receive: three strings.
 *
 * Not the key, not the item, not the vault. The worst a bug in the fill path
 * can do is type a wrong value into one field, on a tab the person explicitly
 * invoked the extension on.
 */
export const fillPayloadSchema = z.object({
  kind: z.literal("fill"),
  username: z.string(),
  password: z.string(),
  totp: z.string(),
});

export type FillPayload = z.infer<typeof fillPayloadSchema>;

export type FillOutcome = "filled" | "no-form";

/**
 * Runs inside the page.
 *
 * Never submits. Filling and submitting are different decisions and only one
 * of them is ours to make.
 */
export function applyFill(payload: FillPayload, doc: Document): FillOutcome {
  const fields = findLoginFields(doc);
  if (!fields.password) return "no-form";

  if (payload.username && fields.username) {
    fillField(fields.username, payload.username);
  }
  fillField(fields.password, payload.password);
  if (payload.totp && fields.totp) fillField(fields.totp, payload.totp);

  return "filled";
}
