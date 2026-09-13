import { describe, expect, it } from "vitest";

import { corsHeaders, EXTENSION_ORIGIN } from "./cors";

describe("corsHeaders", () => {
  it("allows the extension origin", () => {
    expect(corsHeaders(EXTENSION_ORIGIN)["Access-Control-Allow-Origin"]).toBe(
      EXTENSION_ORIGIN,
    );
  });

  it("allows the Authorization header, or the bearer token never arrives", () => {
    expect(corsHeaders(EXTENSION_ORIGIN)["Access-Control-Allow-Headers"]).toContain(
      "authorization",
    );
  });

  it("exposes set-auth-token, or sign-in cannot read its own reply", () => {
    // A cross-origin response hides every header not named here, so without
    // this the token is delivered and unreadable.
    expect(corsHeaders(EXTENSION_ORIGIN)["Access-Control-Expose-Headers"]).toContain(
      "set-auth-token",
    );
  });

  it("returns nothing at all for an unknown origin", () => {
    // An echo of whatever Origin arrived would make this allow every site.
    expect(corsHeaders("https://evil.example")).toEqual({});
  });

  it("returns nothing for a null origin", () => {
    expect(corsHeaders(null)).toEqual({});
  });

  it("is not fooled by an origin that merely starts with ours", () => {
    expect(corsHeaders(`${EXTENSION_ORIGIN}.evil.example`)).toEqual({});
  });

  it("does not allow credentials, because the extension uses a bearer token", () => {
    expect(
      corsHeaders(EXTENSION_ORIGIN)["Access-Control-Allow-Credentials"],
    ).toBeUndefined();
  });
});
