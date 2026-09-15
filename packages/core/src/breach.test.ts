import { describe, expect, it, vi } from "vitest";

import { checkPassword, HIBP_RANGE_URL, sweepVault, type Fetcher } from "./breach";

/** SHA-1 of "password", uppercase: 5BAA6 1E4C9 B93F3 F0682 250B6 CF833 1B7EE 68FD8 */
const PASSWORD_SHA1 = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
const PASSWORD_PREFIX = PASSWORD_SHA1.slice(0, 5);
const PASSWORD_SUFFIX = PASSWORD_SHA1.slice(5);

/** A fetcher that answers as HIBP does: suffix:count, one per line, CRLF. */
function hibp(entries: Record<string, string>): Fetcher {
  return (url: string) => {
    const prefix = url.slice(HIBP_RANGE_URL.length);
    const body = entries[prefix] ?? "";
    return Promise.resolve({ ok: true, text: () => Promise.resolve(body) });
  };
}

const KNOWN = hibp({
  [PASSWORD_PREFIX]: [
    "0000000000000000000000000000000000A:12",
    `${PASSWORD_SUFFIX}:9659365`,
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3",
  ].join("\r\n"),
});

describe("checkPassword", () => {
  it("finds a breached password and its count", async () => {
    const result = await checkPassword("password", KNOWN);
    expect(result).toEqual({ kind: "breached", count: 9659365 });
  });

  it("sends only the first five characters of the hash", async () => {
    // The entire privacy argument for this feature. If the full hash ever left
    // the device, this would be a password-disclosure endpoint.
    const spy = vi.fn(KNOWN);
    await checkPassword("password", spy);

    const url = spy.mock.calls[0]![0];
    expect(url).toBe(`${HIBP_RANGE_URL}${PASSWORD_PREFIX}`);

    // Assert on the part we control, not the whole string: the host is
    // api.pwnedpasswords.com, which contains "password" all by itself.
    const sent = url.slice(HIBP_RANGE_URL.length);
    expect(sent).toBe(PASSWORD_PREFIX);
    expect(sent).toHaveLength(5);
    expect(sent).not.toContain(PASSWORD_SUFFIX);
    expect(sent.toLowerCase()).not.toContain("password");
  });

  it("reports safe when the suffix is absent", async () => {
    const result = await checkPassword("a-password-nobody-has-ever-used-42", KNOWN);
    expect(result.kind).toBe("safe");
  });

  it("treats an empty password as safe without a request", async () => {
    const spy = vi.fn(KNOWN);
    expect(await checkPassword("", spy)).toEqual({ kind: "safe" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("degrades to unknown when the service is unreachable", async () => {
    // The single most important behaviour here. Reporting "safe" because a
    // request failed would tell someone their breached password is fine.
    const offline: Fetcher = () => Promise.reject(new Error("offline"));
    const result = await checkPassword("password", offline);
    expect(result.kind).toBe("unknown");
  });

  it("degrades to unknown on a non-ok response", async () => {
    const rateLimited: Fetcher = () =>
      Promise.resolve({ ok: false, text: () => Promise.resolve("") });
    expect((await checkPassword("password", rateLimited)).kind).toBe("unknown");
  });

  it("does not mistake a malformed line for a match", async () => {
    const junk = hibp({ [PASSWORD_PREFIX]: "garbage\n\nnot:a:hash\n" });
    expect((await checkPassword("password", junk)).kind).toBe("safe");
  });

  it("matches case-insensitively, since the API is not consistent", async () => {
    const lower = hibp({ [PASSWORD_PREFIX]: `${PASSWORD_SUFFIX.toLowerCase()}:5` });
    expect(await checkPassword("password", lower)).toEqual({ kind: "breached", count: 5 });
  });

  it("falls back to a count of one when the number is unreadable", async () => {
    const odd = hibp({ [PASSWORD_PREFIX]: `${PASSWORD_SUFFIX}:lots` });
    expect(await checkPassword("password", odd)).toEqual({ kind: "breached", count: 1 });
  });
});

describe("sweepVault", () => {
  const entries = [
    { id: "a", title: "A", password: "password" },
    { id: "b", title: "B", password: "password" },
    { id: "c", title: "C", password: "a-password-nobody-has-ever-used-42" },
    { id: "d", title: "D", password: "" },
  ];

  it("reports every item using a breached password", async () => {
    const sweep = await sweepVault(entries, KNOWN);
    expect(sweep.breached.map((b) => b.id).sort()).toEqual(["a", "b"]);
  });

  it("makes one request per distinct password, not per item", async () => {
    // Twenty items sharing a password should cost one request, not twenty.
    const spy = vi.fn(KNOWN);
    await sweepVault(entries, spy);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("skips empty passwords entirely", async () => {
    const sweep = await sweepVault(entries, KNOWN);
    expect(sweep.checked).toBe(3);
    expect([...sweep.breached, ...sweep.unknown].map((x) => x.id)).not.toContain("d");
  });

  it("puts unreachable items in unknown, never in safe", async () => {
    const offline: Fetcher = () => Promise.reject(new Error("offline"));
    const sweep = await sweepVault(entries, offline);
    expect(sweep.breached).toEqual([]);
    expect(sweep.unknown.map((u) => u.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("sorts the most-breached first", async () => {
    const many = hibp({
      [PASSWORD_PREFIX]: `${PASSWORD_SUFFIX}:100`,
    });
    const sweep = await sweepVault(
      [
        { id: "a", title: "A", password: "password" },
        { id: "b", title: "B", password: "password" },
      ],
      many,
    );
    expect(sweep.breached).toHaveLength(2);
    expect(sweep.breached[0]!.count).toBe(100);
  });
});
