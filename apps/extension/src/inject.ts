import { z } from "zod";

import { findSuggestableFields } from "./fields";
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

/** Relayed to the content script when the suggestion iframe measures itself. */
export const resizeMessageSchema = z.object({
  kind: z.literal("passio-resize"),
  height: z.number().int().positive().max(2000),
});

/**
 * Runs inside the page.
 *
 * Never submits. Filling and submitting are different decisions and only one
 * of them is ours to make.
 */
export function applyFill(payload: FillPayload, doc: Document): FillOutcome {
  const fields = findSuggestableFields(doc);

  let filled = false;

  if (payload.username && fields.username) {
    fillField(fields.username, payload.username);
    filled = true;
  }

  // Only ever when the strict rule found exactly one visible password field.
  // A two-step login has none yet, and filling the username alone is the right
  // answer there - the password page comes next.
  if (fields.password) {
    fillField(fields.password, payload.password);
    filled = true;
  }

  if (payload.totp && fields.totp) {
    fillField(fields.totp, payload.totp);
    filled = true;
  }

  return filled ? "filled" : "no-form";
}
