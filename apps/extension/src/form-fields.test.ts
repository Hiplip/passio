// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { findFormFields, hasFormFields } from "./form-fields";

function page(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;

  // jsdom gives every element a zero-size box, which the visibility rule reads
  // as hidden. Stub a real one so the rule under test is the interesting part.
  for (const el of doc.querySelectorAll("input")) {
    el.getBoundingClientRect = () => ({ width: 180, height: 32 }) as DOMRect;
  }
  return doc;
}

describe("autocomplete attributes win", () => {
  it("reads the standard tokens", () => {
    const doc = page(`
      <input autocomplete="cc-name">
      <input autocomplete="cc-number">
      <input autocomplete="cc-exp-month">
      <input autocomplete="cc-exp-year">
      <input autocomplete="cc-csc">
    `);
    const fields = findFormFields(doc);
    expect(Object.keys(fields).sort()).toEqual([
      "cardCvv",
      "cardExpMonth",
      "cardExpYear",
      "cardNumber",
      "cardholderName",
    ]);
  });

  it("ignores section and billing prefixes", () => {
    // The attribute legitimately carries these; a parser that demands an exact
    // match finds nothing on half the checkouts on the web.
    const doc = page('<input autocomplete="section-payment billing cc-number">');
    expect(findFormFields(doc).cardNumber).toBeTruthy();
  });

  it("beats a misleading name", () => {
    // The whole reason the standard is checked first. This field is a card
    // number whatever it is called.
    const doc = page('<input name="coupon_code" autocomplete="cc-number">');
    const fields = findFormFields(doc);
    expect(fields.cardNumber?.getAttribute("name")).toBe("coupon_code");
  });

  it("reads identity tokens", () => {
    const doc = page(`
      <input autocomplete="given-name">
      <input autocomplete="family-name">
      <input autocomplete="email">
      <input autocomplete="tel">
      <input autocomplete="address-line1">
      <input autocomplete="address-level2">
      <input autocomplete="postal-code">
      <input autocomplete="country-name">
    `);
    const fields = findFormFields(doc);
    expect(fields.firstName).toBeTruthy();
    expect(fields.lastName).toBeTruthy();
    expect(fields.email).toBeTruthy();
    expect(fields.phone).toBeTruthy();
    expect(fields.address1).toBeTruthy();
    expect(fields.city).toBeTruthy();
    expect(fields.postalCode).toBeTruthy();
    expect(fields.country).toBeTruthy();
  });
});

describe("falling back to hints", () => {
  it("reads names when there is no autocomplete", () => {
    const doc = page(`
      <input name="cardNumber">
      <input name="cvv">
      <input name="billing_city">
    `);
    const fields = findFormFields(doc);
    expect(fields.cardNumber).toBeTruthy();
    expect(fields.cardCvv).toBeTruthy();
    expect(fields.city).toBeTruthy();
  });

  it("reads a placeholder", () => {
    const doc = page('<input placeholder="Postcode">');
    expect(findFormFields(doc).postalCode).toBeTruthy();
  });

  it("reads an aria-label", () => {
    const doc = page('<input aria-label="Security code">');
    expect(findFormFields(doc).cardCvv).toBeTruthy();
  });

  it("prefers the security code over the card number for a cvv-ish name", () => {
    // Ordering in the pattern table. "cardnumber2" is a security code field on
    // some forms, and typing a card number into it is a failed checkout.
    const doc = page('<input name="cvv2">');
    const fields = findFormFields(doc);
    expect(fields.cardCvv).toBeTruthy();
    expect(fields.cardNumber).toBeUndefined();
  });

  it("does not claim a field the standard already assigned", () => {
    const doc = page(`
      <input autocomplete="cc-number" name="a">
      <input name="card_number">
    `);
    const fields = findFormFields(doc);
    expect(fields.cardNumber?.getAttribute("name")).toBe("a");
  });
});

describe("visibility", () => {
  it("skips a hidden input", () => {
    // Planting an off-screen input to harvest autofill is a documented attack,
    // not a hypothetical.
    const doc = page('<input type="hidden" autocomplete="cc-number">');
    expect(findFormFields(doc).cardNumber).toBeUndefined();
  });

  it("skips a disabled or readonly input", () => {
    const doc = page(`
      <input autocomplete="cc-number" disabled>
      <input autocomplete="cc-csc" readonly>
    `);
    expect(findFormFields(doc)).toEqual({});
  });

  it("skips aria-hidden", () => {
    const doc = page('<input autocomplete="cc-number" aria-hidden="true">');
    expect(findFormFields(doc).cardNumber).toBeUndefined();
  });

  it("skips a zero-size input", () => {
    const doc = page('<input autocomplete="cc-number">');
    const input = doc.querySelector("input")!;
    input.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
    expect(findFormFields(doc).cardNumber).toBeUndefined();
  });
});

describe("repeated roles", () => {
  it("takes the first and leaves the rest alone", () => {
    // Billing and shipping both present. Filling both would be a guess about
    // which the person meant.
    const doc = page(`
      <input autocomplete="address-line1" id="billing">
      <input autocomplete="address-line1" id="shipping">
    `);
    expect(findFormFields(doc).address1?.id).toBe("billing");
  });
});

describe("hasFormFields", () => {
  it("is false on a page with nothing to fill", () => {
    expect(hasFormFields(page('<input type="search" name="q">'))).toBe(false);
  });

  it("is true on a checkout", () => {
    expect(hasFormFields(page('<input autocomplete="cc-number">'))).toBe(true);
  });

  it("is false on an empty page", () => {
    expect(hasFormFields(page(""))).toBe(false);
  });
});
