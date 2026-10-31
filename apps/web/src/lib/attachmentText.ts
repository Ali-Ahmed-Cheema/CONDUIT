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
const maxImageSizeBytes = 10 * 1024 * 1024;
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

  if (isTextFile(file) && file.size > MAX_CHAT_HISTORY_CHARACTERS * 3) {
    throw new Error(`${file.name} exceeds the supported chat text size.`);
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
