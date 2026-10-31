export type GeneratedCodeFile = {
  name: string;
  content: string;
};

const languageExtensions: Record<string, string> = {
  bash: "sh",
  c: "c",
  "c#": "cs",
  "c++": "cpp",
  cpp: "cpp",
  csharp: "cs",
  css: "css",
  csv: "csv",
  diff: "diff",
  dockerfile: "dockerfile",
  go: "go",
  golang: "go",
  html: "html",
  ini: "ini",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  markdown: "md",
  md: "md",
  objectivec: "m",
  objectivecpp: "mm",
  plaintext: "txt",
  powershell: "ps1",
  py: "py",
  python: "py",
  ruby: "rb",
  rust: "rs",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  swift: "swift",
  text: "txt",
  toml: "toml",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  txt: "txt",
  xml: "xml",
  yaml: "yaml",
  yml: "yml",
};

function extensionForLanguage(language: string): string {
  const normalized = language.toLowerCase().replace(/^language-/, "");
  const knownExtension = languageExtensions[normalized];
  if (knownExtension) return knownExtension;
  if (/^[a-z0-9][a-z0-9.+-]*$/.test(normalized)) return normalized;
  return "txt";
}

export function generatedFileNameForCode(language: string | undefined, suggestedName?: string): string {
  const extension = extensionForLanguage(language ?? "");
  if (suggestedName) {
    if (extension !== "txt" && suggestedName.toLowerCase().endsWith(".txt")) {
      return `${suggestedName.slice(0, -4)}.${extension}`;
    }
    return suggestedName;
  }
  return `generated.${extension}`;
}

function infoTokens(info: string): string[] {
  return info.match(/(?:[^\s"'=]+=(?:"[^"]*"|'[^']*'|[^\s]+)|"[^"]*"|'[^']*'|[^\s]+)/g) ?? [];
}

function tokenValue(token: string): string {
  return token.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_match, doubleQuoted: string, singleQuoted: string) =>
    doubleQuoted ?? singleQuoted,
  );
}

function filePathFromInfo(info: string, language: string): string | null {
  const tokens = infoTokens(info);
  const namedToken = tokens.find((token) => /^(?:file|filename|title)=/i.test(token));
  const namedPath = namedToken?.replace(/^(?:file|filename|title)=/i, "");
  const barePath = tokens.slice(language ? 1 : 0).find((token) => {
    const value = tokenValue(token);
    return !token.includes("=") && (value.includes("/") || value.includes("\\") || /\.[^./\\]+$/.test(value));
  });
  const candidate = namedPath ? tokenValue(namedPath) : barePath ? tokenValue(barePath) : null;
  if (!candidate) return null;

  const normalized = candidate.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) return null;
  const safeSegments = segments
    .filter((segment) => segment && segment !== ".")
    .map((segment) => Array.from(segment.replace(/[<>:"|?*]/g, "_"))
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join("")
      .replace(/[. ]+$/g, ""));
  if (safeSegments.length === 0 || safeSegments.some((segment) => !segment)) return null;

  const filename = safeSegments[safeSegments.length - 1];
  if (!/\.[^./]+$/.test(filename)) {
    safeSegments[safeSegments.length - 1] = `${filename}.${extensionForLanguage(language)}`;
  }
  return safeSegments.join("/");
}

function uniqueName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name.toLowerCase())) {
    usedNames.add(name.toLowerCase());
    return name;
  }

  const lastSlash = name.lastIndexOf("/");
  const directory = lastSlash >= 0 ? name.slice(0, lastSlash + 1) : "";
  const filename = lastSlash >= 0 ? name.slice(lastSlash + 1) : name;
  const lastDot = filename.lastIndexOf(".");
  const stem = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const extension = lastDot > 0 ? filename.slice(lastDot) : "";
  let suffix = 2;
  let candidate = `${directory}${stem}-${suffix}${extension}`;
  while (usedNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${directory}${stem}-${suffix}${extension}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function extractGeneratedCodeFiles(markdown: string): GeneratedCodeFile[] {
  const lines = markdown.split(/\r?\n/);
  const files: GeneratedCodeFile[] = [];
  const usedNames = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index]?.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening) continue;

    const fence = opening[1] ?? "";
    const info = opening[2]?.trim() ?? "";
    if (fence[0] === "`" && info.includes("`")) continue;
    const closingPattern = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
    const closingIndex = lines.findIndex((line, lineIndex) => lineIndex > index && closingPattern.test(line));
    if (closingIndex < 0) continue;

    const tokens = infoTokens(info);
    const languageToken = tokens.find((token) => !token.includes("=")) ?? "";
    const language = tokenValue(languageToken);
    let name = filePathFromInfo(info, language);
    if (!name) name = `generated.${extensionForLanguage(language)}`;
    name = uniqueName(name, usedNames);

    const body = lines.slice(index + 1, closingIndex).join("\n");
    files.push({ name, content: body ? `${body}\n` : "" });
    index = closingIndex;
  }

  return files;
}

export async function createGeneratedFilesZip(files: GeneratedCodeFile[]): Promise<Uint8Array> {
  const { strToU8, zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) entries[file.name] = strToU8(file.content);
  return zipSync(entries);
}

export function downloadGeneratedFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
