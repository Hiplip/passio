import { describe, expect, it } from "vitest";

import { fillValuesFor } from "./fill-values";

describe("cards", () => {
  const card = {
    type: "card" as const,
    title: "Visa",
    cardholderName: "P Ang",
    number: "4111111111111111",
    cvv: "123",
    expMonth: 4,
    expYear: 2030,
  };

  it("maps the printed fields", () => {
    const values = fillValuesFor(card);
    expect(values.cardholderName).toBe("P Ang");
    expect(values.cardNumber).toBe("4111111111111111");
    expect(values.cardCvv).toBe("123");
  });

  it("pads the month to two digits, as the card prints it", () => {
    expect(fillValuesFor(card).cardExpMonth).toBe("04");
  });

  it("offers a combined MM/YY for forms with one expiry box", () => {
    expect(fillValuesFor(card).cardExp).toBe("04/30");
  });

  it("omits the combined expiry when half of it is missing", () => {
    expect(fillValuesFor({ ...card, expYear: undefined }).cardExp).toBeUndefined();
  });

  it("omits empty values rather than sending blanks", () => {
    // Filling a field with "" looks like the extension wiped it.
    const values = fillValuesFor({ type: "card", title: "Empty" });
    expect(values).toEqual({});
  });

  it("omits a whitespace-only value", () => {
    expect(fillValuesFor({ ...card, cvv: "   " }).cardCvv).toBeUndefined();
  });
});

describe("identities", () => {
  const identity = {
    type: "identity" as const,
    title: "Me",
    firstName: "Philip",
    middleName: "Angelo",
    lastName: "Ang",
    email: "me@example.com",
    city: "Manila",
    postalCode: "1000",
  };

  it("maps the address and contact fields", () => {
    const values = fillValuesFor(identity);
    expect(values.firstName).toBe("Philip");
    expect(values.lastName).toBe("Ang");
    expect(values.email).toBe("me@example.com");
    expect(values.city).toBe("Manila");
    expect(values.postalCode).toBe("1000");
  });

  it("builds a full name for forms with one name box", () => {
    expect(fillValuesFor(identity).fullName).toBe("Philip Angelo Ang");
  });

  it("builds a full name without a middle name", () => {
    expect(fillValuesFor({ ...identity, middleName: undefined }).fullName).toBe(
      "Philip Ang",
    );
  });

  it("omits the full name when there is none", () => {
    const values = fillValuesFor({ type: "identity", title: "Empty" });
    expect(values.fullName).toBeUndefined();
  });
});

describe("everything else", () => {
  it("contributes nothing", () => {
    // A login fills through the login path; a note has nothing a form wants.
    expect(fillValuesFor({ type: "login", title: "X", username: "u" })).toEqual({});
    expect(fillValuesFor({ type: "note", title: "X", body: "b" })).toEqual({});
  });
});
