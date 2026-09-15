import { describe, expect, it } from "vitest";

import { parseCsv, parseCsvRecords, pick } from "./csv-parse";

describe("parseCsv", () => {
  it("reads plain rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    // The whole reason this file exists. split(",") turns one password into two.
    expect(parseCsv('a,b\n"one,two",three')).toEqual([
      ["a", "b"],
      ["one,two", "three"],
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('pw\n"he said ""hi"""')).toEqual([["pw"], ['he said "hi"']]);
  });

  it("keeps a newline inside a quoted field", () => {
    // Secure notes are full of these.
    expect(parseCsv('note\n"line one\nline two"')).toEqual([
      ["note"],
      ["line one\nline two"],
    ]);
  });

  it("handles CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles CRLF and LF mixed in one file", () => {
    expect(parseCsv("a\r\n1\n2\r\n")).toEqual([["a"], ["1"], ["2"]]);
  });

  it("strips a byte order mark", () => {
    // Excel writes one, and without this the first header is "\uFEFFname" and
    // every lookup for "name" misses.
    expect(parseCsv('\uFEFFname,url\nx,y')[0]).toEqual(["name", "url"]);
  });

  it("does not invent a row for a trailing newline", () => {
    expect(parseCsv("a\n1\n")).toHaveLength(2);
  });

  it("keeps empty cells", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("reads a field that is only a comma", () => {
    expect(parseCsv('a\n","')).toEqual([["a"], [","]]);
  });

  it("does not lose an unterminated quoted field", () => {
    // Malformed, but losing the data is worse than keeping what is there.
    expect(parseCsv('a\n"unclosed')).toEqual([["a"], ["unclosed"]]);
  });
});

describe("parseCsvRecords", () => {
  it("keys by lowercased header", () => {
    expect(parseCsvRecords("Name,URL\nGitHub,github.com")).toEqual([
      { name: "GitHub", url: "github.com" },
    ]);
  });

  it("skips blank lines in the middle of a file", () => {
    expect(parseCsvRecords("a\n1\n\n2")).toEqual([{ a: "1" }, { a: "2" }]);
  });

  it("fills missing trailing columns with empty strings", () => {
    // A short row must not make every later column undefined.
    expect(parseCsvRecords("a,b,c\n1")).toEqual([{ a: "1", b: "", c: "" }]);
  });

  it("returns nothing when there is no header", () => {
    expect(parseCsvRecords("")).toEqual([]);
  });
});

describe("pick", () => {
  const record = { name: "GitHub", login_uri: "", url: "github.com" };

  it("takes the first name that holds something", () => {
    expect(pick(record, "login_uri", "url")).toBe("github.com");
  });

  it("skips a present but empty column", () => {
    expect(pick(record, "login_uri")).toBeUndefined();
  });

  it("returns undefined when none are present", () => {
    expect(pick(record, "nope")).toBeUndefined();
  });
});
