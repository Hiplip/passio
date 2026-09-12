import { describe, expect, it } from "vitest";

import { parseRequest, type Request } from "./messages";

const ID = "11111111-1111-4111-8111-111111111111";

describe("parseRequest", () => {
  it("accepts a status request", () => {
    expect(parseRequest({ target: "offscreen", kind: "status" })).toEqual({
      target: "offscreen",
      kind: "status",
    });
  });

  it("accepts an unlock request", () => {
    const req: Request = {
      target: "offscreen",
      kind: "unlock",
      email: "a@b.co",
      password: "hunter2hunter2",
    };
    expect(parseRequest(req)).toEqual(req);
  });

  it("accepts a fieldValue request for each allowed field", () => {
    for (const field of ["username", "password", "totp"] as const) {
      expect(parseRequest({
        target: "offscreen", kind: "fieldValue", itemId: ID, field,
      })).not.toBeNull();
    }
  });

  it("accepts a matchCount request", () => {
    expect(parseRequest({
      target: "offscreen", kind: "matchCount", url: "https://github.com/",
    })).not.toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(parseRequest({ target: "offscreen", kind: "exfiltrate" })).toBeNull();
  });

  it("rejects a message with no target", () => {
    // Without a target both the background worker and the offscreen document
    // would answer, and the winner would be a race.
    expect(parseRequest({ kind: "status" })).toBeNull();
  });

  it("rejects a message aimed somewhere else", () => {
    expect(parseRequest({ target: "background", kind: "status" })).toBeNull();
  });

  it("rejects a field name that is not one of the three", () => {
    expect(parseRequest({
      target: "offscreen", kind: "fieldValue", itemId: ID, field: "notes",
    })).toBeNull();
  });

  it("rejects an item id that is not a uuid", () => {
    expect(parseRequest({
      target: "offscreen", kind: "fieldValue", itemId: "../../etc", field: "password",
    })).toBeNull();
  });

  it("rejects an unlock with a malformed email", () => {
    expect(parseRequest({
      target: "offscreen", kind: "unlock", email: "nope", password: "x",
    })).toBeNull();
  });

  it("rejects junk", () => {
    for (const junk of [null, undefined, "status", 42, [], true]) {
      expect(parseRequest(junk)).toBeNull();
    }
  });
});
