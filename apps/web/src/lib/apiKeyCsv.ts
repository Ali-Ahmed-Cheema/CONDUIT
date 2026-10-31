function detectDelimiter(csv: string): string {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted && character === '"' && csv[index + 1] === '"') {
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      break;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  return [...counts].reduce((delimiter, entry) => entry[1] > (counts.get(delimiter) ?? 0) ? entry[0] : delimiter, ",");
}

function parseCsvRows(csv: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new Error("The CSV file contains an incorrectly quoted value.");
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The CSV file contains an unterminated quoted value.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const apiKeyHeaders = new Set(["apikey", "key", "token", "accesstoken", "apitoken"]);

export function parseApiKeyCsv(csv: string): { keys: string[]; duplicateCount: number } {
  const contents = csv.replace(/^\uFEFF/, "");
  const rows = parseCsvRows(contents, detectDelimiter(contents));
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === "")) rows.pop();
  if (rows.length === 0) throw new Error("The CSV file is empty.");

  const headerIndex = rows[0].findIndex((cell) => apiKeyHeaders.has(normalizeHeader(cell)));
  const hasHeader = headerIndex >= 0;
  if (!hasHeader && rows[0].length > 1) {
    throw new Error('Add a column named "API key" or "key" to CSV files with multiple columns.');
  }

  const columnIndex = hasHeader ? headerIndex : 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const keys: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const dataRow of dataRows) {
    const key = (dataRow[columnIndex] ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    keys.push(key);
  }

  if (keys.length === 0) throw new Error("No API keys were found in the CSV file.");
  return { keys, duplicateCount };
}
