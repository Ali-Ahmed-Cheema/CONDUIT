import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { createGeneratedFilesZip, extractGeneratedCodeFiles } from "../lib/generatedFiles";

describe("generated code files", () => {
  it("uses common language extensions for individual code downloads", () => {
    expect(extractGeneratedCodeFiles(
      "```cpp\nint main() {}\n```\n\n```python\nprint('hello')\n```",
    )).toEqual([
      { name: "generated.cpp", content: "int main() {}\n" },
      { name: "generated.py", content: "print('hello')\n" },
    ]);
  });

  it("preserves safe file paths and extensions from code fence metadata", () => {
    expect(extractGeneratedCodeFiles(
      '```typescript filename="src/main.ts"\nexport {};\n```\n\n~~~svg assets/icon.svg\n<svg />\n~~~',
    )).toEqual([
      { name: "src/main.ts", content: "export {};\n" },
      { name: "assets/icon.svg", content: "<svg />\n" },
    ]);
  });

  it("rejects path traversal and makes duplicate names unique", () => {
    expect(extractGeneratedCodeFiles(
      "```cpp filename=\"../outside.cpp\"\nint first;\n```\n\n```cpp filename=\"generated.cpp\"\nint second;\n```",
    )).toEqual([
      { name: "generated.cpp", content: "int first;\n" },
      { name: "generated-2.cpp", content: "int second;\n" },
    ]);
  });

  it("creates a ZIP that keeps project folders and file contents", () => {
    const zip = createGeneratedFilesZip([
      { name: "src/main.cpp", content: "int main() {}\n" },
      { name: "README.md", content: "# Project\n" },
    ]);
    const extracted = unzipSync(zip);

    expect(Object.keys(extracted).sort()).toEqual(["README.md", "src/main.cpp"]);
    expect(strFromU8(extracted["src/main.cpp"]!)).toBe("int main() {}\n");
    expect(strFromU8(extracted["README.md"]!)).toBe("# Project\n");
  });
});
