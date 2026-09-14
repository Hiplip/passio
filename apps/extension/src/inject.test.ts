// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { applyFill, fillPayloadSchema, type FillPayload } from "./inject";

function dom(html: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  doc.body.innerHTML = html;
  for (const el of doc.querySelectorAll("input:not([data-invisible])")) {
    el.getBoundingClientRect = () => ({ width: 200, height: 32 }) as DOMRect;
  }
  return doc;
}

const payload = (over: Partial<FillPayload> = {}): FillPayload => ({
  kind: "fill",
  username: "ada",
  password: "s3cret",
  totp: "",
  ...over,
});

const LOGIN = `
  <form>
    <input type="text" id="u" />
    <input type="password" id="pw" />
    <button>Sign in</button>
  </form>`;

describe("applyFill", () => {
  it("fills username and password", () => {
    const doc = dom(LOGIN);
    expect(applyFill(payload(), doc)).toBe("filled");
    expect(doc.querySelector<HTMLInputElement>("#u")!.value).toBe("ada");
    expect(doc.querySelector<HTMLInputElement>("#pw")!.value).toBe("s3cret");
  });

  it("reports no-form when there is no password field", () => {
    const doc = dom(`<form><input type="text" id="q" /></form>`);
    expect(applyFill(payload(), doc)).toBe("no-form");
  });

  it("fills the password even when there is no username field", () => {
    const doc = dom(`<form><input type="password" id="pw" /></form>`);
    expect(applyFill(payload(), doc)).toBe("filled");
    expect(doc.querySelector<HTMLInputElement>("#pw")!.value).toBe("s3cret");
  });

  it("leaves the username alone when the payload has none", () => {
    const doc = dom(LOGIN);
    applyFill(payload({ username: "" }), doc);
    expect(doc.querySelector<HTMLInputElement>("#u")!.value).toBe("");
  });

  it("fills a one-time code when the page asks for one", () => {
    const doc = dom(`
      <form>
        <input type="text" id="u" />
        <input type="password" id="pw" />
        <input id="otp" autocomplete="one-time-code" />
      </form>`);
    applyFill(payload({ totp: "123456" }), doc);
    expect(doc.querySelector<HTMLInputElement>("#otp")!.value).toBe("123456");
  });

  it("never submits the form", () => {
    const doc = dom(LOGIN);
    let submitted = false;
    doc.querySelector("form")!.addEventListener("submit", () => { submitted = true; });
    applyFill(payload(), doc);
    expect(submitted).toBe(false);
  });

  it("refuses a change-password form rather than guessing", () => {
    const doc = dom(`
      <form>
        <input type="password" id="old" />
        <input type="password" id="new" />
      </form>`);
    expect(applyFill(payload(), doc)).toBe("no-form");
    expect(doc.querySelector<HTMLInputElement>("#old")!.value).toBe("");
  });

  it("never fills a hidden honeypot field", () => {
    const doc = dom(`
      <form>
        <input type="text" id="trap" data-invisible />
        <input type="password" id="pw" />
      </form>`);
    applyFill(payload(), doc);
    expect(doc.querySelector<HTMLInputElement>("#trap")!.value).toBe("");
  });
});

describe("fillPayloadSchema", () => {
  it("accepts a well-formed payload", () => {
    expect(fillPayloadSchema.safeParse(payload()).success).toBe(true);
  });

  it("rejects anything that is not a fill message", () => {
    for (const junk of [
      null, "fill", 42,
      { kind: "fill", username: "a" },
      { kind: "other", username: "a", password: "b", totp: "" },
      { kind: "fill", username: 1, password: "b", totp: "" },
    ]) {
      expect(fillPayloadSchema.safeParse(junk).success).toBe(false);
    }
  });
});

describe("applyFill on a two-step login", () => {
  it("fills the username when the page has no password field yet", () => {
    const doc = dom(`<form><input type="email" id="email" /></form>`);
    expect(applyFill(payload(), doc)).toBe("filled");
    expect(doc.querySelector<HTMLInputElement>("#email")!.value).toBe("ada");
  });

  it("reports no-form when there is nothing at all to fill", () => {
    const doc = dom(`<p>nothing here</p>`);
    expect(applyFill(payload(), doc)).toBe("no-form");
  });

  it("still refuses a change-password form", () => {
    const doc = dom(`
      <form>
        <input type="password" id="old" />
        <input type="password" id="new" />
      </form>`);
    expect(applyFill(payload(), doc)).toBe("no-form");
    expect(doc.querySelector<HTMLInputElement>("#old")!.value).toBe("");
  });
});
