import { parseApiKeyRows } from "./apiKeyCsv";

const maxXlsxXmlBytes = 10 * 1024 * 1024;

function xmlElements(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", localName));
}

function parseXml(xml: string, fileName: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${fileName} contains invalid spreadsheet data.`);
  }
  return document;
}

function columnIndex(reference: string | null): number {
  const letters = reference?.match(/^([A-Z]+)\d+$/i)?.[1];
  if (!letters) throw new Error("The XLSX file contains a cell without a valid column.");
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + letter.charCodeAt(0) - 64;
    if (index > 16_384) throw new Error("The XLSX file contains a cell outside the supported column range.");
  }
  return index - 1;
}

export async function parseApiKeyXlsx(bytes: Uint8Array, fileName: string): Promise<{ keys: string[]; duplicateCount: number }> {
  const { strFromU8, unzipSync } = await import("fflate");
  let xmlSize = 0;
  let exceedsXmlLimit = false;
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes, {
      filter: ({ name, originalSize }) => {
        const relevant = name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/i.test(name);
        if (!relevant) return false;
        xmlSize += originalSize;
        if (xmlSize > maxXlsxXmlBytes) {
          exceedsXmlLimit = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new Error(`${fileName} is not a readable XLSX workbook.`);
  }
  if (exceedsXmlLimit) throw new Error(`${fileName} contains too much spreadsheet data.`);

  const sharedStringsFile = archive["xl/sharedStrings.xml"];
  const sharedStrings = sharedStringsFile
    ? xmlElements(parseXml(strFromU8(sharedStringsFile), fileName), "si")
      .map((item) => xmlElements(item, "t").map((text) => text.textContent ?? "").join(""))
    : [];
  const sheetNames = Object.keys(archive)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((first, second) => Number(first.match(/sheet(\d+)/i)?.[1]) - Number(second.match(/sheet(\d+)/i)?.[1]));
  if (sheetNames.length === 0) throw new Error(`${fileName} does not contain a readable worksheet.`);

  const rows = sheetNames.flatMap((name) => {
    const document = parseXml(strFromU8(archive[name]!), fileName);
    return xmlElements(document, "row").map((row) => {
      const cells: string[] = [];
      for (const cell of xmlElements(row, "c")) {
        const type = cell.getAttribute("t");
        let value: string;
        if (type === "inlineStr") {
          value = xmlElements(cell, "t").map((text) => text.textContent ?? "").join("");
        } else {
          value = xmlElements(cell, "v")[0]?.textContent ?? "";
          if (type === "s") {
            const sharedStringIndex = Number(value);
            if (!Number.isInteger(sharedStringIndex) || sharedStringIndex < 0 || sharedStringIndex >= sharedStrings.length) {
              throw new Error(`${fileName} contains an invalid shared string reference.`);
            }
            value = sharedStrings[sharedStringIndex]!;
          }
        }
        cells[columnIndex(cell.getAttribute("r"))] = value;
      }
      return Array.from(cells, (cell) => cell ?? "");
    });
  });

  return parseApiKeyRows(rows, "XLSX");
}
