import { MAX_CHAT_HISTORY_CHARACTERS } from "@conduit/core";

const textFileExtensions = new Set([
  ".txt", ".md", ".markdown", ".mdx", ".rst", ".adoc", ".csv", ".tsv", ".json", ".jsonl",
  ".xml", ".html", ".htm", ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py",
  ".java", ".c", ".h", ".cpp", ".hpp", ".cs", ".go", ".rs", ".php", ".rb", ".sh", ".bash",
  ".sql", ".yaml", ".yml", ".toml", ".ini", ".conf", ".properties", ".log", ".svg", ".env",
  ".diff", ".patch", ".vue", ".svelte", ".tf", ".hcl", ".tex", ".ipynb", ".pem",
]);

const imageFileExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif",
]);
const officeDocumentExtensions = new Set([".docx", ".pptx", ".xlsx", ".odt", ".odp", ".ods"]);
const officeDocumentMimeTypes = new Map([
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.oasis.opendocument.text", ".odt"],
  ["application/vnd.oasis.opendocument.presentation", ".odp"],
  ["application/vnd.oasis.opendocument.spreadsheet", ".ods"],
]);
const maxImageSizeBytes = 10 * 1024 * 1024;
const maxOfficeDocumentSizeBytes = 10 * 1024 * 1024;
const maxOfficeDocumentXmlBytes = MAX_CHAT_HISTORY_CHARACTERS * 4;
const ocrWorkerOptions = {
  workerPath: "/ocr-assets/worker.min.js",
  corePath: "/ocr-assets",
  langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int",
  gzip: true,
  workerBlobURL: false,
};

function isTextFile(file: File): boolean {
  const mimeType = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = file.name.match(/\.[^.]+$/)?.[0].toLowerCase();
  return mimeType.startsWith("text/")
    || /^(application\/(json|ld\+json|xml|javascript|x-javascript|yaml|x-yaml)|image\/svg\+xml)$/.test(mimeType)
    || Boolean(extension && textFileExtensions.has(extension));
}

function isImageFile(file: File): boolean {
  const mimeType = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = file.name.match(/\.[^.]+$/)?.[0].toLowerCase();
  return (mimeType.startsWith("image/") && !isTextFile(file))
    || Boolean(extension && imageFileExtensions.has(extension));
}

function getExtension(file: File): string {
  return file.name.match(/\.[^.]+$/)?.[0].toLowerCase() ?? "";
}

function getOfficeDocumentExtension(file: File): string {
  const extension = getExtension(file);
  if (officeDocumentExtensions.has(extension)) return extension;
  const mimeType = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  return officeDocumentMimeTypes.get(mimeType) ?? "";
}

function xmlElements(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", localName));
}

function parseXml(xml: string, fileName: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${fileName} contains invalid document data.`);
  }
  return document;
}

function extractParagraphs(xml: string, fileName: string, paragraphName: string, textName: string): string {
  const document = parseXml(xml, fileName);
  return xmlElements(document, paragraphName)
    .map((paragraph) => xmlElements(paragraph, textName).map((text) => text.textContent ?? "").join(""))
    .filter(Boolean)
    .join("\n");
}

function extractSpreadsheet(xmlFiles: Record<string, Uint8Array>): string {
  const sharedStringsFile = xmlFiles["xl/sharedStrings.xml"];
  const sharedStrings = sharedStringsFile
    ? xmlElements(parseXml(new TextDecoder().decode(sharedStringsFile), "spreadsheet"), "si")
      .map((item) => xmlElements(item, "t").map((text) => text.textContent ?? "").join(""))
    : [];
  const sheets = Object.keys(xmlFiles)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((first, second) => Number(first.match(/sheet(\d+)/i)?.[1]) - Number(second.match(/sheet(\d+)/i)?.[1]));
  return sheets.map((name) => {
    const document = parseXml(new TextDecoder().decode(xmlFiles[name]), name);
    return xmlElements(document, "row")
      .map((row) => xmlElements(row, "c").map((cell) => {
        const type = cell.getAttribute("t");
        if (type === "inlineStr") {
          return xmlElements(cell, "t").map((text) => text.textContent ?? "").join("");
        }
        const value = xmlElements(cell, "v")[0]?.textContent ?? "";
        return type === "s" ? sharedStrings[Number(value)] ?? "" : value;
      }).join("\t"))
      .filter(Boolean)
      .join("\n");
  }).filter(Boolean).join("\n\n");
}

async function extractOfficeDocument(file: File, bytes: Uint8Array, extension: string): Promise<string> {
  if (file.size > maxOfficeDocumentSizeBytes) {
    throw new Error(`${file.name} exceeds the 10 MB document limit.`);
  }
  const { strFromU8, unzipSync } = await import("fflate");
  let archive: Record<string, Uint8Array>;
  let xmlSize = 0;
  let exceedsTextLimit = false;
  const isRelevantXml = (name: string) => {
    if (extension === ".docx") return name === "word/document.xml";
    if (extension === ".pptx") return /^ppt\/slides\/slide\d+\.xml$/i.test(name);
    if (extension === ".xlsx") return name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/i.test(name);
    return name === "content.xml";
  };
  try {
    archive = unzipSync(bytes, {
      filter: ({ name, originalSize }) => {
        if (!isRelevantXml(name)) return false;
        xmlSize += originalSize;
        if (xmlSize > maxOfficeDocumentXmlBytes) {
          exceedsTextLimit = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new Error(`${file.name} is not a readable office document.`);
  }
  if (exceedsTextLimit) {
    throw new Error(`${file.name} contains more text than the supported chat size.`);
  }

  let extracted = "";
  if (extension === ".docx") {
    const documentXml = archive["word/document.xml"];
    if (documentXml) extracted = extractParagraphs(strFromU8(documentXml), file.name, "p", "t");
  } else if (extension === ".pptx") {
    extracted = Object.keys(archive)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((first, second) => Number(first.match(/slide(\d+)/i)?.[1]) - Number(second.match(/slide(\d+)/i)?.[1]))
      .map((name) => extractParagraphs(strFromU8(archive[name]!), file.name, "p", "t"))
      .filter(Boolean)
      .join("\n\n");
  } else if (extension === ".xlsx") {
    extracted = extractSpreadsheet(archive);
  } else {
    const contentXml = archive["content.xml"];
    if (contentXml) {
      const document = parseXml(strFromU8(contentXml), file.name);
      extracted = Array.from(document.getElementsByTagName("*"))
        .filter((element) => element.localName === "p" || element.localName === "h")
        .map((element) => element.textContent?.trim() ?? "")
        .filter(Boolean)
        .join("\n");
    }
  }

  if (!extracted.trim()) {
    throw new Error(`No readable text was found in ${file.name}.`);
  }
  return `Extracted text (${extension.slice(1).toUpperCase()}):\n${extracted}`;
}

function hasBinaryControlCharacters(content: string): boolean {
  for (const character of content) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) return true;
  }
  return false;
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "";
  const hasUtf16LeBom = bytes[0] === 0xff && bytes[1] === 0xfe;
  const hasUtf16BeBom = bytes[0] === 0xfe && bytes[1] === 0xff;
  if (hasUtf16LeBom || hasUtf16BeBom) {
    const encoding = hasUtf16LeBom ? "utf-16le" : "utf-16be";
    const content = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(2));
    return hasBinaryControlCharacters(content) ? null : content;
  }
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return hasBinaryControlCharacters(content) ? null : content;
  } catch {
    try {
      const content = new TextDecoder("windows-1252").decode(bytes);
      return hasBinaryControlCharacters(content) ? null : content;
    } catch {
      return null;
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function convertImageToText(file: File): Promise<string> {
  if (file.size > maxImageSizeBytes) {
    throw new Error(`${file.name} exceeds the 10 MB image limit.`);
  }
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, ocrWorkerOptions);
  try {
    const { data: { text } } = await worker.recognize(file);
    const extractedText = text.trim();
    if (!extractedText) {
      throw new Error(`No readable text was found in ${file.name}. Try a clearer image.`);
    }
    return `OCR text (English):\n${extractedText}`;
  } finally {
    await worker.terminate();
  }
}

export async function convertFileToText(file: File): Promise<string> {
  if (isImageFile(file)) return convertImageToText(file);

  const officeExtension = getOfficeDocumentExtension(file);
  if (isTextFile(file) && file.size > MAX_CHAT_HISTORY_CHARACTERS * 3) {
    throw new Error(`${file.name} exceeds the supported chat text size.`);
  }
  if (officeExtension) {
    return extractOfficeDocument(file, new Uint8Array(await file.arrayBuffer()), officeExtension);
  }
  const mimeType = file.type || "unknown";
  const binaryPrefix = `Binary file converted to base64 text.\nOriginal file: ${file.name}\nMIME type: ${mimeType}\nEncoding: base64\n\n`;
  if (!isTextFile(file) && 4 * Math.ceil(file.size / 3) + binaryPrefix.length > MAX_CHAT_HISTORY_CHARACTERS) {
    throw new Error(`${file.name} exceeds the supported chat text size.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const content = isTextFile(file) ? decodeText(bytes) : null;
  if (content !== null) return content;

  return [
    `Binary file converted to base64 text.`,
    `Original file: ${file.name}`,
    `MIME type: ${mimeType}`,
    "Encoding: base64",
    "",
    toBase64(bytes),
  ].join("\n");
}
