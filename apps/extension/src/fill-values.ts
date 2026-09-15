import type { Item } from "@passio/core/schema";

import type { FillRole } from "./form-fields";

/**
 * The values an item can contribute to a checkout or signup form.
 *
 * Returns strings keyed by role, so the content script never has to know what
 * an item type is. Empty values are omitted rather than sent as "" - filling a
 * field with nothing looks like the extension wiped it.
 */
export function fillValuesFor(item: Item): Partial<Record<FillRole, string>> {
  const out: Partial<Record<FillRole, string>> = {};

  const put = (role: FillRole, value: string | number | undefined) => {
    if (value === undefined) return;
    const text = String(value).trim();
    if (text.length > 0) out[role] = text;
  };

  if (item.type === "card") {
    put("cardholderName", item.cardholderName);
    put("cardNumber", item.number);
    put("cardCvv", item.cvv);
    put("cardExpMonth", item.expMonth === undefined ? undefined : pad2(item.expMonth));
    put("cardExpYear", item.expYear);

    // Forms that use one combined expiry box expect MM/YY, which is what is
    // printed on the card.
    if (item.expMonth !== undefined && item.expYear !== undefined) {
      put("cardExp", `${pad2(item.expMonth)}/${String(item.expYear).slice(-2)}`);
    }
  }

  if (item.type === "identity") {
    put("firstName", item.firstName);
    put("lastName", item.lastName);
    put("company", item.company);
    put("email", item.email);
    put("phone", item.phone);
    put("address1", item.address1);
    put("address2", item.address2);
    put("city", item.city);
    put("state", item.state);
    put("postalCode", item.postalCode);
    put("country", item.country);

    const full = [item.firstName, item.middleName, item.lastName]
      .filter((part) => part && part.trim().length > 0)
      .join(" ");
    put("fullName", full);
  }

  return out;
}

/** A month is printed on a card as two digits, and some forms validate that. */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
