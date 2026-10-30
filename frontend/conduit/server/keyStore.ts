import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ProviderId } from "../src/types";

export interface StoredConnection {
  id: string;
  provider: ProviderId;
  providerName: string;
  keyHint: string;
  models: string[];
  addedAt: string;
  encryptedKey: { iv: string; tag: string; ciphertext: string };
}

interface StoreFile {
  connections: StoredConnection[];
  activeId: string | null;
}

const storePath = resolve(process.cwd(), "data", "connections.json");
const defaultStore: StoreFile = { connections: [], activeId: null };

function encryptionKey(): Buffer {
  const encoded = process.env.CONDUIT_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("CONDUIT_ENCRYPTION_KEY is required. Set it in .env or generate one with npm run generate:key.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== encoded) {
    throw new Error("CONDUIT_ENCRYPTION_KEY must be valid base64 encoding exactly 32 bytes. Generate one with npm run generate:key.");
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

export async function readStore(): Promise<StoreFile> {
  try {
    const data = await readFile(storePath, "utf8");
    const parsed = JSON.parse(data) as StoreFile;
    if (!Array.isArray(parsed.connections) || !(parsed.activeId === null || typeof parsed.activeId === "string")) {
      throw new Error("Stored connection data is malformed.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { connections: [], activeId: null };
    }
    throw error;
  }
}

export async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  const { rename } = await import("node:fs/promises");
  await rename(temporaryPath, storePath);
}
