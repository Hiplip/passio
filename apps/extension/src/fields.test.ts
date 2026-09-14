// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { findLoginFields, findSuggestableFields } from "./fields";

/**
 * jsdom reports every element as zero-sized, so the visibility check would
 * reject the whole page. Give real inputs a box; anything marked
 * data-invisible keeps the default of none and stands in for a hidden field.
 */
function dom(html: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  doc.body.innerHTML = html;
  for (const el of doc.querySelectorAll("input:not([data-invisible])")) {
    el.getBoundingClientRect = () => ({ width: 200, height: 32 }) as DOMRect;
  }
  return doc;
}

describe("findLoginFields", () => {
  it("finds a plain username and password form", () => {
    const f = findLoginFields(dom(`
      <form>
        <input name="username" type="text" />
        <input name="password" type="password" />
        <button>Sign in</button>
      </form>`));
    expect(f.username?.getAttribute("name")).toBe("username");
    expect(f.password?.getAttribute("name")).toBe("password");
  });

  it("finds an email and password form", () => {
    expect(findLoginFields(dom(`
      <form><input type="email" id="email" /><input type="password" id="pw" /></form>
    `)).username?.id).toBe("email");
  });

  it("works when the fields are not inside a form", () => {
    const f = findLoginFields(dom(`
      <div><input type="text" id="u" /><input type="password" id="p" /></div>`));
    expect(f.username?.id).toBe("u");
    expect(f.password?.id).toBe("p");
  });

  it("prefers autocomplete=username over a nearer plain text input", () => {
    expect(findLoginFields(dom(`
      <form>
        <input type="text" id="user" autocomplete="username" />
        <input type="text" id="search" />
        <input type="password" id="pw" />
      </form>`)).username?.id).toBe("user");
  });

  it("refuses a form with two password fields", () => {
    // Registration or change-password. Guessing is user-hostile, so the popup
    // falls back to copy.
    expect(findLoginFields(dom(`
      <form>
        <input type="text" id="u" />
        <input type="password" id="new" />
        <input type="password" id="confirm" />
      </form>`)).password).toBeNull();
  });

  it("refuses a page with no password field", () => {
    expect(findLoginFields(dom(`<form><input type="text" id="q" /></form>`)).password)
      .toBeNull();
  });

  it("never returns a hidden password field", () => {
    expect(findLoginFields(dom(`
      <form><input type="password" id="honeypot" data-invisible /></form>
    `)).password).toBeNull();
  });

  it("never returns a hidden username field", () => {
    // A page that plants an off-screen input to harvest autofill is a
    // documented attack, not a hypothetical.
    const f = findLoginFields(dom(`
      <form>
        <input type="text" id="trap" data-invisible />
        <input type="password" id="pw" />
      </form>`));
    expect(f.password?.id).toBe("pw");
    expect(f.username).toBeNull();
  });

  it("treats aria-hidden as hidden", () => {
    expect(findLoginFields(dom(`
      <form><input type="password" id="pw" aria-hidden="true" /></form>
    `)).password).toBeNull();
  });

  it("skips disabled and readonly inputs", () => {
    expect(findLoginFields(dom(`
      <form>
        <input type="text" id="u1" disabled />
        <input type="text" id="u2" readonly />
        <input type="text" id="u3" />
        <input type="password" id="pw" />
      </form>`)).username?.id).toBe("u3");
  });

  it("ignores type=hidden", () => {
    expect(findLoginFields(dom(`
      <form>
        <input type="hidden" name="csrf" />
        <input type="text" id="u" />
        <input type="password" id="pw" />
      </form>`)).username?.id).toBe("u");
  });

  it("does not take a username from after the password field", () => {
    expect(findLoginFields(dom(`
      <form>
        <input type="password" id="pw" />
        <input type="text" id="after" />
      </form>`)).username).toBeNull();
  });

  it("finds a one-time-code field by autocomplete", () => {
    expect(findLoginFields(dom(`
      <form><input id="otp" autocomplete="one-time-code" /></form>
    `)).totp?.id).toBe("otp");
  });

  it("finds a one-time-code field by name", () => {
    expect(findLoginFields(dom(`<form><input id="c" name="totp_code" /></form>`)).totp?.id)
      .toBe("c");
  });

  it("never mistakes the password field for a one-time-code field", () => {
    expect(findLoginFields(dom(`
      <form><input type="password" id="pw" name="otp_password" /></form>
    `)).totp).toBeNull();
  });

  it("returns nulls for a page with no inputs at all", () => {
    expect(findLoginFields(dom(`<p>nothing here</p>`)))
      .toEqual({ username: null, password: null, totp: null });
  });
});

describe("findSuggestableFields", () => {
  it("returns the same fields as the strict finder on a normal form", () => {
    const doc = dom(`
      <form>
        <input type="text" id="u" />
        <input type="password" id="pw" />
      </form>`);
    const f = findSuggestableFields(doc);
    expect(f.username?.id).toBe("u");
    expect(f.password?.id).toBe("pw");
  });

  it("finds a lone email field on a two-step login", () => {
    // Google, Microsoft and most SSO flows ask for the email first, with no
    // password field on the page at all. Bitwarden shows its icon there.
    const doc = dom(`<form><input type="email" id="email" /></form>`);
    const f = findSuggestableFields(doc);
    expect(f.username?.id).toBe("email");
    expect(f.password).toBeNull();
  });

  it("finds a lone field marked autocomplete=username", () => {
    const doc = dom(`<form><input type="text" id="u" autocomplete="username" /></form>`);
    expect(findSuggestableFields(doc).username?.id).toBe("u");
  });

  it("does not decorate an unmarked text box", () => {
    // Otherwise every search field on the web sprouts a button. Decorating is
    // cheap to get wrong, but not free.
    const doc = dom(`<form><input type="text" id="q" placeholder="Search" /></form>`);
    expect(findSuggestableFields(doc).username).toBeNull();
  });

  it("still refuses a change-password form", () => {
    // Two password fields: the strict finder returns nothing, and there is no
    // lone username to fall back to either.
    const doc = dom(`
      <form>
        <input type="password" id="new" />
        <input type="password" id="confirm" />
      </form>`);
    const f = findSuggestableFields(doc);
    expect(f.password).toBeNull();
    expect(f.username).toBeNull();
  });

  it("never returns a hidden field", () => {
    const doc = dom(`<form><input type="email" id="trap" data-invisible /></form>`);
    expect(findSuggestableFields(doc).username).toBeNull();
  });
});
