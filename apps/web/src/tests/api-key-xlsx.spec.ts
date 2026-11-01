// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseApiKeyXlsx } from "../lib/apiKeyXlsx";

describe("parseApiKeyXlsx", () => {
  it("reads keys from a named column, including cells after blank columns", async () => {
    const bytes = zipSync({
      "xl/sharedStrings.xml": strToU8(
        "<sst><si><t>Name</t></si><si><t>API key</t></si><si><t>First</t></si><si><t>sk-first-key</t></si><si><t>Second</t></si></sst>",
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row><c r="A2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row><row><c r="A3" t="s"><v>4</v></c><c r="C3" t="s"><v>3</v></c></row></sheetData></worksheet>',
      ),
    });

    await expect(parseApiKeyXlsx(bytes, "keys.xlsx")).resolves.toEqual({
      keys: ["sk-first-key"],
      duplicateCount: 1,
    });
  });

  it("rejects unreadable XLSX files", async () => {
    await expect(parseApiKeyXlsx(strToU8("not a workbook"), "keys.xlsx"))
      .rejects.toThrow("keys.xlsx is not a readable XLSX workbook.");
  });
});
