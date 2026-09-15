import { fieldValue, TYPE_SPECS } from "./fields";
import type { Item } from "./schema";
import { generateTotp } from "./totp";

export interface CopyAction {
  key: string;
  label: string;
  value: string;
}

/** Keeps empty and whitespace-only fields out of the menu. */
function push(into: CopyAction[], key: string, label: string, value?: string): void {
  if (value !== undefined && value.trim().length > 0) into.push({ key, label, value });
}

/**
 * The copyable fields of an item, in the order someone reaches for them.
 *
 * Only fields that actually hold something are returned: offering "Copy
 * password" on an item with no password puts an empty string on the clipboard
 * and looks like the app lost it.
 *
 * The one-time code is generated at call time, so a menu left open does not
 * hand over a code from the previous window.
 */
export function copyActionsFor(item: Item, now: number = Date.now()): CopyAction[] {
  const actions: CopyAction[] = [];

  // Driven by the per-type table rather than a switch, so a new item type
  // arrives with its copy menu already working. A switch here was one more
  // place to forget.
  for (const { key, label } of TYPE_SPECS[item.type].copyable) {
    push(actions, key, label, fieldValue(item, key));
  }

  if (item.type === "login" && item.totp) {
    try {
      push(actions, "totp", "Copy one-time code", generateTotp(item.totp, now));
    } catch {
      // A malformed secret should cost one menu entry, not the whole menu.
    }
  }

  // Anything the user added themselves, after the built-in fields.
  for (const field of item.fields ?? []) {
    if (field.kind === "boolean") continue;
    push(actions, `custom:${field.name}`, `Copy ${field.name || "field"}`, field.value);
  }

  return actions;
}

/** The website to open for an item, when it has a usable one. */
export function launchUrlFor(item: Item): string | null {
  if (item.type !== "login") return null;

  // The first address that is not explicitly silenced. `never` means "do not
  // offer this here", which covers opening it too.
  const raw = (
    item.uris?.find((entry) => entry.match !== "never")?.uri ?? item.uri
  )?.trim();
  if (!raw) return null;

  // A bare domain is what people actually type, so make it openable - but only
  // over http(s), so a stored "javascript:" or "file:" can never be launched.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
