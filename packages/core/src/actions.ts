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

  switch (item.type) {
    case "login":
      push(actions, "username", "Copy username", item.username);
      push(actions, "password", "Copy password", item.password);
      if (item.totp) {
        try {
          push(actions, "totp", "Copy one-time code", generateTotp(item.totp, now));
        } catch {
          // A malformed secret should cost one menu entry, not the whole menu.
        }
      }
      break;

    case "note":
      push(actions, "body", "Copy note", item.body);
      break;

    case "card":
      push(actions, "number", "Copy card number", item.number);
      push(actions, "cvv", "Copy security code", item.cvv);
      break;
  }

  return actions;
}

/** The website to open for an item, when it has a usable one. */
export function launchUrlFor(item: Item): string | null {
  if (item.type !== "login") return null;

  const raw = item.uri?.trim();
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
