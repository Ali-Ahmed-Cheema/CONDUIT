import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tesseractPackage = require.resolve("tesseract.js/package.json");
const tesseractDirectory = dirname(tesseractPackage);
const corePackage = createRequire(tesseractPackage).resolve("tesseract.js-core/package.json");
const coreDirectory = dirname(corePackage);
const outputDirectory = join(webDirectory, "public", "ocr-assets");

await mkdir(outputDirectory, { recursive: true });

for (const [source, name] of [
  [join(tesseractDirectory, "dist", "worker.min.js"), "worker.min.js"],
  [join(coreDirectory, "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  [join(coreDirectory, "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
]) {
  await copyFile(source, join(outputDirectory, name));
}
