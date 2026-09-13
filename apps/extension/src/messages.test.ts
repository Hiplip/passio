import { describe, expect, it } from "vitest";

import { parseBackgroundRequest, parseRequest, type Request } from "./messages";

const ID = "11111111-1111-4111-8111-111111111111";

describe("parseRequest", () => {
  it("accepts a status request", () => {
    expect(
      parseRequest({ target: "offscreen", via: "background", kind: "status" }),
    ).toEqual({ target: "offscreen", via: "background", kind: "status" });
  });

  it("accepts an unlock request", () => {
    const req: Request = {
      target: "offscreen",
      via: "background",
      kind: "unlock",
      email: "a@b.co",
      password: "hunter2hunter2",
    };
    expect(parseRequest(req)).toEqual(req);
  });

  it("accepts a fieldValue request for each allowed field", () => {
    for (const field of ["username", "password", "totp"] as const) {
      expect(parseRequest({
        target: "offscreen", via: "background", kind: "fieldValue", itemId: ID, field,
      })).not.toBeNull();
    }
  });

  it("accepts a matchCount request", () => {
    expect(parseRequest({
      target: "offscreen", via: "background", kind: "matchCount",
      url: "https://github.com/",
    })).not.toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(parseRequest({
      target: "offscreen", via: "background", kind: "exfiltrate",
    })).toBeNull();
  });

  it("rejects a message with no target", () => {
    // Without a target both the background worker and the offscreen document
    // would answer, and the winner would be a race.
    expect(parseRequest({ via: "background", kind: "status" })).toBeNull();
  });

  it("rejects a message aimed somewhere else", () => {
    expect(parseRequest({
      target: "background", via: "background", kind: "status",
    })).toBeNull();
  });

  it("rejects a field name that is not one of the three", () => {
    expect(parseRequest({
      target: "offscreen", via: "background", kind: "fieldValue",
      itemId: ID, field: "notes",
    })).toBeNull();
  });

  it("rejects an item id that is not a uuid", () => {
    expect(parseRequest({
      target: "offscreen", via: "background", kind: "fieldValue",
      itemId: "../../etc", field: "password",
    })).toBeNull();
  });

  it("rejects an unlock with a malformed email", () => {
    expect(parseRequest({
      target: "offscreen", via: "background", kind: "unlock",
      email: "nope", password: "x",
    })).toBeNull();
  });

  it("rejects a message the service worker has not forwarded", () => {
    // sendMessage broadcasts to every context, so the offscreen document also
    // hears the popup's original. Without `via` it would handle the same
    // request twice - two Argon2id runs per unlock.
    expect(parseRequest({ target: "offscreen", kind: "status" })).toBeNull();
    expect(parseRequest({ target: "offscreen", via: "popup", kind: "status" }))
      .toBeNull();
  });

  it("rejects junk", () => {
    for (const junk of [null, undefined, "status", 42, [], true]) {
      expect(parseRequest(junk)).toBeNull();
    }
  });
});

describe("parseBackgroundRequest", () => {
  it("accepts the three token operations", () => {
    expect(parseBackgroundRequest({ target: "background", kind: "tokenRead" }))
      .not.toBeNull();
    expect(parseBackgroundRequest({
      target: "background", kind: "tokenWrite", token: "T",
    })).not.toBeNull();
    expect(parseBackgroundRequest({ target: "background", kind: "tokenClear" }))
      .not.toBeNull();
  });

  it("rejects an empty token", () => {
    expect(parseBackgroundRequest({
      target: "background", kind: "tokenWrite", token: "",
    })).toBeNull();
  });

  it("rejects an offscreen-targeted message", () => {
    // The two listeners share one broadcast channel; each must ignore the
    // other's traffic or both answer and the winner is a race.
    expect(parseBackgroundRequest({ target: "offscreen", kind: "status" })).toBeNull();
  });

  it("rejects junk", () => {
    for (const junk of [null, undefined, "tokenRead", 42, {}]) {
      expect(parseBackgroundRequest(junk)).toBeNull();
    }
  });
});
