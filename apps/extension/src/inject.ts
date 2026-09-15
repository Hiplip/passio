import { z } from "zod";

import { findSuggestableFields } from "./fields";
import { fillField } from "./fill";
import { findFormFields, type FillRole } from "./form-fields";

/**
 * What the content script is allowed to receive: strings, by role.
 *
 * Not the key, not the item, not the vault. The worst a bug in the fill path
 * can do is type a wrong value into one field, on a tab the person explicitly
 * invoked the extension on.
 *
 * `fields` grew out of the original three when cards and identities arrived.
 * It is a flat record rather than a nested object on purpose: the content
 * script should not have to know what an item type is, only what a field role
 * is, and a record keeps the boundary at strings.
 */
export const fillPayloadSchema = z.object({
  kind: z.literal("fill"),
  username: z.string(),
  password: z.string(),
  totp: z.string(),
  /** Card and identity values, keyed by the role they fill. */
  fields: z.record(z.string(), z.string()).optional(),
});

export type FillPayload = z.infer<typeof fillPayloadSchema>;

export type FillOutcome = "filled" | "no-form";

/** Sent to every open tab when page access is revoked, so the overlay removes
 *  itself instead of lingering until that tab is reloaded. */
export const teardownMessageSchema = z.object({
  kind: z.literal("passio-teardown"),
});

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

  // Card and identity fields first: a checkout page has no password field, and
  // filling these must not depend on the login path finding anything.
  if (payload.fields && Object.keys(payload.fields).length > 0) {
    const form = findFormFields(doc);
    for (const [role, input] of Object.entries(form)) {
      const value = payload.fields[role as FillRole];
      if (!value || !input) continue;
      fillField(input, value);
      filled = true;
    }
  }

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
