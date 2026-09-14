export interface LoginFields {
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
  totp: HTMLInputElement | null;
}

const USERNAME_HINT = /user|email|login|account/i;
const TOTP_HINT = /otp|totp|2fa|twofactor|one-?time/i;

/**
 * Never fill something the person cannot see.
 *
 * Pages that plant an off-screen input to harvest autofill are a documented
 * attack on password managers, not a hypothetical. Every clause here is a
 * reason to skip a field, and the default when unsure is to skip.
 */
function visible(el: HTMLInputElement): boolean {
  if (el.type === "hidden" || el.disabled || el.readOnly) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function hints(el: HTMLInputElement): string {
  return `${el.name} ${el.id} ${el.getAttribute("autocomplete") ?? ""} ${el.placeholder}`;
}

/** The last element matching a predicate. Written out rather than using
 *  Array.findLast, which needs a newer lib target than this project sets. */
function last<T>(items: T[], predicate: (item: T) => boolean): T | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!;
    if (predicate(item)) return item;
  }
  return null;
}

/**
 * Fields worth putting a suggestion button on.
 *
 * Deliberately more permissive than `findLoginFields`, because the two jobs
 * carry different risk. Decorating the wrong field costs a stray button;
 * filling the wrong field costs an account. So filling keeps the strict rule
 * and suggesting relaxes one case: a page with NO password field at all, which
 * is every two-step login that asks for your email first. Google, Microsoft
 * and most SSO flows look like this, and Bitwarden shows its icon on them.
 *
 * The relaxation needs an explicit signal - `autocomplete="username"`, an email
 * input, or a name that says so. It will not decorate any old text box, or
 * every search field on the web would sprout a button.
 */
export function findSuggestableFields(doc: Document): LoginFields {
  const strict = findLoginFields(doc);
  if (strict.password ?? strict.username) return strict;

  const inputs = [...doc.querySelectorAll("input")].filter(visible);
  const candidates = inputs.filter((el) => el.type === "text" || el.type === "email");

  const username =
    last(candidates, (el) => el.getAttribute("autocomplete") === "username") ??
    last(candidates, (el) => el.type === "email") ??
    last(candidates, (el) => USERNAME_HINT.test(hints(el)));

  return { username, password: null, totp: strict.totp };
}

/**
 * The username, password and one-time-code fields of a login form.
 *
 * Pure over a Document so it can be tested in jsdom, which matters more here
 * than anywhere else in the project: there is no browser on the build machine,
 * and this is the only code that touches a page the user did not write.
 */
export function findLoginFields(doc: Document): LoginFields {
  const inputs = Array.from(doc.querySelectorAll("input")).filter(visible);
  const passwords = inputs.filter((el) => el.type === "password");

  // Exactly one, or none at all. Zero means this is not a login form; two or
  // more means registration or change-password, where a wrong guess is
  // user-hostile. Falling back to copy costs one paste; filling the wrong box
  // costs an account.
  const password = passwords.length === 1 ? passwords[0]! : null;

  let username: HTMLInputElement | null = null;
  if (password) {
    const before = inputs.slice(0, inputs.indexOf(password));
    const candidates = before.filter(
      (el) => el.type === "text" || el.type === "email",
    );
    username =
      last(candidates, (el) => el.getAttribute("autocomplete") === "username") ??
      last(candidates, (el) => el.type === "email") ??
      last(candidates, (el) => USERNAME_HINT.test(hints(el))) ??
      last(candidates, () => true);
  }

  const totp =
    inputs.find((el) => el.getAttribute("autocomplete") === "one-time-code") ??
    inputs.find((el) => el.type !== "password" && TOTP_HINT.test(hints(el))) ??
    null;

  return { username, password, totp };
}
