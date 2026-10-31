import { describe, expect, it } from "vitest";
import { parseApiKeyCsv } from "../lib/apiKeyCsv";

describe("parseApiKeyCsv", () => {
  it("reads a single-column CSV with a header and a UTF-8 BOM", () => {
    expect(parseApiKeyCsv("\uFEFFAPI Key\r\nsk-first-key\r\nsk-second-key\r\n")).toEqual({
      keys: ["sk-first-key", "sk-second-key"],
      duplicateCount: 0,
    });
  });

  it("reads keys from a named column in a spreadsheet export", () => {
    expect(parseApiKeyCsv('Name,API_Key,Notes\n"First key",sk-first-key,work\nSecond,sk-second-key,personal')).toEqual({
      keys: ["sk-first-key", "sk-second-key"],
      duplicateCount: 0,
    });
  });

  it("supports semicolon-delimited Excel exports", () => {
    expect(parseApiKeyCsv("Name;API Key;Notes\nFirst;sk-first-key;work\nSecond;sk-second-key;personal")).toEqual({
      keys: ["sk-first-key", "sk-second-key"],
      duplicateCount: 0,
    });
  });

  it("removes blank rows and duplicate keys", () => {
    expect(parseApiKeyCsv("key\nsk-first-key\n\nsk-first-key\nsk-second-key")).toEqual({
      keys: ["sk-first-key", "sk-second-key"],
      duplicateCount: 1,
    });
  });

  it("rejects ambiguous multi-column CSV files", () => {
    expect(() => parseApiKeyCsv("first,second\none,two")).toThrow(/column named "API key"/);
  });

  it("rejects malformed quoted values", () => {
    expect(() => parseApiKeyCsv('"key\nsk-first-key')).toThrow(/unterminated quoted value/);
  });
});
