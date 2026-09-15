/**
 * Finding the card and identity fields on a checkout form.
 *
 * Detection runs in two passes, and the order is the whole design:
 *
 * 1. `autocomplete` attributes, which are a standard the site AUTHOR wrote for
 *    exactly this purpose. When present they are authoritative and there is no
 *    reason to guess.
 * 2. Name, id and placeholder heuristics, only for fields the first pass did
 *    not claim.
 *
 * Getting this backwards - guessing first, checking the standard second - is
 * how a manager types a card number into a "coupon code" box.
 */

/** Every role a checkout form field can be filled from. */
export type FillRole =
  | "cardholderName"
  | "cardNumber"
  | "cardExpMonth"
  | "cardExpYear"
  | "cardExp"
  | "cardCvv"
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "address1"
  | "address2"
  | "city"
  | "state"
  | "postalCode"
  | "country"
  | "company";

/** The `autocomplete` tokens the HTML standard defines, mapped to our roles. */
const AUTOCOMPLETE: Record<string, FillRole> = {
  "cc-name": "cardholderName",
  "cc-number": "cardNumber",
  "cc-exp-month": "cardExpMonth",
  "cc-exp-year": "cardExpYear",
  "cc-exp": "cardExp",
  "cc-csc": "cardCvv",
  "given-name": "firstName",
  "family-name": "lastName",
  name: "fullName",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "address-line1": "address1",
  "address-line2": "address2",
  "street-address": "address1",
  "address-level2": "city",
  "address-level1": "state",
  "postal-code": "postalCode",
  country: "country",
  "country-name": "country",
  organization: "company",
};

/**
 * A word boundary that understands real field names.
 *
 * `\b` treats `_` and digits as word characters, so `\bcity\b` does not match
 * "billing_city" and `\bcvv\b` does not match "cvv2" - and field names in the
 * wild are made almost entirely of underscores and trailing digits. Bounding on
 * LETTERS instead is what makes the heuristics fire on real forms.
 */
function boundedPattern(body: string): RegExp {
  return new RegExp(`(?<![a-z])(?:${body})(?![a-z])`, "i");
}

/**
 * Fallback patterns, checked against name, id, placeholder and aria-label.
 *
 * Ordered: the first match wins, so the more specific patterns come first.
 * `cardCvv` before `cardNumber` matters, because some forms name the security
 * code field "cardnumber2" and typing a card number into it is a failed
 * checkout.
 */
const PATTERNS: Array<[FillRole, RegExp]> = [
  ["cardCvv", boundedPattern("cvv|cvc|csc|security[-_ ]?code|card[-_ ]?code")],
  ["cardExpMonth", /(exp|expiry|expiration)[^a-z]*(month|mm)|^month$/i],
  ["cardExpYear", /(exp|expiry|expiration)[^a-z]*(year|yy)|^year$/i],
  ["cardExp", boundedPattern("exp|expiry|expiration")],
  ["cardNumber", boundedPattern("card[-_ ]?number|ccnum(?:ber)?|credit[-_ ]?card|pan")],
  ["cardholderName", boundedPattern("card[-_ ]?holder|name[-_ ]?on[-_ ]?card|cc[-_ ]?name")],
  ["postalCode", boundedPattern("zip|postal|postcode|zipcode")],
  ["address2", boundedPattern("address[-_ ]?2|apt|suite|unit")],
  ["address1", boundedPattern("address|street")],
  ["city", boundedPattern("city|town|locality")],
  ["state", boundedPattern("state|province|region|county")],
  ["country", boundedPattern("country")],
  ["company", boundedPattern("company|organi[sz]ation|business")],
  ["firstName", boundedPattern("first[-_ ]?name|given[-_ ]?name|forename|fname")],
  ["lastName", boundedPattern("last[-_ ]?name|family[-_ ]?name|surname|lname")],
  ["fullName", /(?<![a-z])(full[-_ ]?name|your[-_ ]?name)(?![a-z])|^name$/i],
  ["phone", boundedPattern("phone|mobile|tel")],
  ["email", boundedPattern("e-?mail")],
];

/**
 * Never fill something the person cannot see.
 *
 * Pages that plant an off-screen input to harvest autofill are a documented
 * attack on password managers. Same rule as the login path, repeated here
 * rather than shared, because relaxing it in one place must not relax it in
 * both.
 */
function visible(el: HTMLInputElement): boolean {
  if (el.type === "hidden" || el.disabled || el.readOnly) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** The first `autocomplete` token that names a role. The attribute can carry
 *  section and billing/shipping prefixes, which are ignored. */
function roleFromAutocomplete(el: HTMLInputElement): FillRole | null {
  const attribute = el.getAttribute("autocomplete");
  if (!attribute) return null;

  for (const token of attribute.toLowerCase().split(/\s+/)) {
    const role = AUTOCOMPLETE[token];
    if (role) return role;
  }
  return null;
}

function roleFromHints(el: HTMLInputElement): FillRole | null {
  const hints = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`;
  for (const [role, pattern] of PATTERNS) {
    if (pattern.test(hints)) return role;
  }
  return null;
}

export type RoleMap = Partial<Record<FillRole, HTMLInputElement>>;

/**
 * Every fillable card or identity field on the page, by role.
 *
 * First wins: a form repeating a role (billing and shipping, say) gets its
 * first instance filled and the rest left alone. Filling both would be a guess
 * about which the person meant.
 */
export function findFormFields(doc: Document): RoleMap {
  const inputs = [...doc.querySelectorAll("input")].filter(visible);
  const found: RoleMap = {};

  // Pass one: the standard, which the site author wrote deliberately.
  for (const el of inputs) {
    const role = roleFromAutocomplete(el);
    if (role && !found[role]) found[role] = el;
  }

  // Pass two: guesses, only where the standard said nothing.
  const claimed = new Set(Object.values(found));
  for (const el of inputs) {
    if (claimed.has(el)) continue;
    const role = roleFromHints(el);
    if (role && !found[role]) found[role] = el;
  }

  return found;
}

/** Whether the page has anything worth offering a card or identity for. */
export function hasFormFields(doc: Document): boolean {
  return Object.keys(findFormFields(doc)).length > 0;
}
