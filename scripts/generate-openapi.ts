import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { typedApi } from "../apps/web/server/v4Api";

const response = await typedApi.request("/openapi.json");
if (!response.ok) {
  throw new Error(`OpenAPI generation failed with status ${response.status}.`);
}

const document: unknown = await response.json();
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/openapi.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
