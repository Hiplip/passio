import { describe, expect, it } from "vitest";

import { digitsOnly, formatCardNumber, maskCardNumber } from "./mask";

describe("maskCardNumber", () => {
  it("reveals only the last four digits of a 16 digit card", () => {
    expect(maskCardNumber("4111111111111111")).toBe("•••• •••• •••• 1111");
  });

  it("groups a 15 digit amex as 3-6-6", () => {
    expect(maskCardNumber("378282246310005")).toBe("••• •••••• ••0005");
  });

  it("returns an empty string for empty input", () => {
    expect(maskCardNumber("")).toBe("");
    expect(maskCardNumber("   ")).toBe("");
  });

  it("reveals nothing when there are four digits or fewer", () => {
    expect(maskCardNumber("1234")).toBe("••••");
    expect(maskCardNumber("7")).toBe("•");
  });

  it("ignores spaces already present in the stored value", () => {
    expect(maskCardNumber("4111 1111 1111 1111")).toBe("•••• •••• •••• 1111");
  });

  it("never emits any digit except the last four", () => {
    const masked = maskCardNumber("4111111111119999");
    expect(masked.replace(/[^0-9]/g, "")).toBe("9999");
  });
});

describe("formatCardNumber", () => {
  it("groups a 16 digit number in fours", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
  });

  it("groups a 15 digit amex as 4-6-5", () => {
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });

  it("leaves a partial number alone", () => {
    expect(formatCardNumber("411")).toBe("411");
    expect(formatCardNumber("41111")).toBe("4111 1");
  });

  it("strips non-digits rather than preserving them", () => {
    expect(formatCardNumber("4111-1111-1111-1111")).toBe("4111 1111 1111 1111");
  });

  it("returns an empty string for empty input", () => {
    expect(formatCardNumber("")).toBe("");
  });
});

describe("digitsOnly", () => {
  it("keeps leading zeroes, which a number type would destroy", () => {
    expect(digitsOnly("0411 1111 1111 1111")).toBe("0411111111111111");
  });

  it("drops everything that is not a digit", () => {
    expect(digitsOnly("4111-abc 1111")).toBe("41111111");
  });
});
