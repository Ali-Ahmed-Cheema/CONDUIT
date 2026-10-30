import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConnectionStoreSchema, type ConnectionStore, type StoredConnection } from "@conduit/core";

export type { StoredConnection } from "@conduit/core";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function getConnectionStorePath(
  root = repositoryRoot,
  dataDirectory = process.env.CONDUIT_DATA_DIR,
): string {
  if (dataDirectory) return resolve(dataDirectory, "connections.json");
  return resolve(root, "frontend", "conduit", "data", "connections.json");
}

const storePath = getConnectionStorePath();

function encryptionKey(): Buffer {
  const encoded = process.env.CONDUIT_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("CONDUIT_ENCRYPTION_KEY is required. Set it in .env or generate one with pnpm generate:key.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== encoded) {
    throw new Error("CONDUIT_ENCRYPTION_KEY must be valid base64 encoding exactly 32 bytes. Generate one with pnpm generate:key.");
  }
  return key;
}

export function validateEncryptionKey(): void {
  encryptionKey();
}

export function encryptApiKey(plainText: string): StoredConnection["encryptedKey"] {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptApiKey(encrypted: StoredConnection["encryptedKey"]): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function readStore(): Promise<ConnectionStore> {
  try {
    const data = await readFile(storePath, "utf8");
    const parsed = ConnectionStoreSchema.safeParse(JSON.parse(data));
    if (!parsed.success) {
      throw new Error("Stored connection data is malformed.");
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { connections: [], activeId: null };
    }
    throw error;
  }
}

export async function writeStore(store: ConnectionStore): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  const { rename } = await import("node:fs/promises");
  await rename(temporaryPath, storePath);
}
