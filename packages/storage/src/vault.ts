import { openDB } from "idb";
import { VaultDataSchema, VaultSetupSchema, type VaultDataContract, type VaultSetupContract } from "@conduit/core";
import { decryptVaultValue, encryptVaultValue } from "@conduit/crypto";

export const VAULT_SCHEMA_VERSION = 1;

export type VaultSetup = VaultSetupContract;

export type VaultData = VaultDataContract;

export interface LockoutRecord {
  failures: number;
  until: number;
}

let dbPromise: ReturnType<typeof openDB> | undefined;
let writeQueue: Promise<void> = Promise.resolve();

function getDb() {
  dbPromise ??= openDB("conduit-v3", 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("vault")) {
        database.createObjectStore("vault");
      }
    },
  });
  return dbPromise;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

function validateSetup(value: unknown): VaultSetup {
  const parsed = VaultSetupSchema.safeParse(value);
  if (!parsed.success) throw new Error("Saved password setup is malformed.");
  return parsed.data;
}

export function migrateVaultData(payload: unknown): VaultData {
  if (!isRecord(payload)) throw new Error("Saved vault data has an invalid format.");
  const version = payload.version === undefined ? 0 : payload.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0 || version > VAULT_SCHEMA_VERSION) {
    throw new Error("Saved vault data uses an unsupported schema version.");
  }
  if (payload.keys !== undefined && !Array.isArray(payload.keys)) {
    throw new Error("Saved vault keys have an invalid format.");
  }
  if (payload.chats !== undefined && !Array.isArray(payload.chats)) {
    throw new Error("Saved conversations have an invalid format.");
  }
  const chats = (payload.chats as unknown[] | undefined) ?? [];
  const chatIds = new Set<string>();
  for (const chat of chats) {
    if (
      !isRecord(chat) ||
      typeof chat.id !== "string" ||
      !chat.id ||
      typeof chat.title !== "string" ||
      typeof chat.createdAt !== "number" ||
      !Number.isFinite(chat.createdAt) ||
      typeof chat.updatedAt !== "number" ||
      !Number.isFinite(chat.updatedAt) ||
      typeof chat.model !== "string" ||
      !Array.isArray(chat.messages) ||
      chatIds.has(chat.id)
    ) {
      throw new Error("Saved conversations have an invalid format.");
    }
    chatIds.add(chat.id);
    for (const message of chat.messages) {
      if (
        !isRecord(message) ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" ||
        (message.id !== undefined && typeof message.id !== "string") ||
        (message.ts !== undefined && (typeof message.ts !== "number" || !Number.isFinite(message.ts))) ||
        (message.model !== undefined && typeof message.model !== "string")
      ) {
        throw new Error("Saved conversation messages have an invalid format.");
      }
    }
  }
  if (payload.settings !== undefined && !isRecord(payload.settings)) {
    throw new Error("Saved vault settings have an invalid format.");
  }
  const normalized = {
    version: VAULT_SCHEMA_VERSION,
    keys: (payload.keys as unknown[] | undefined) ?? [],
    chats,
    settings: (payload.settings as Record<string, unknown> | undefined) ?? {},
  };
  const validated = VaultDataSchema.safeParse(normalized);
  if (!validated.success) throw new Error("Saved vault data has an invalid format.");
  return validated.data;
}

function recordId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === "string" ? value.id : undefined;
}

function mergeRecords<T>(current: T[], imported: T[]): T[] {
  const importedIds = new Set(imported.map(recordId).filter((id): id is string => id !== undefined));
  return [
    ...imported,
    ...current.filter((record) => {
      const id = recordId(record);
      return id === undefined || !importedIds.has(id);
    }),
  ];
}

export function mergeVaultData(currentValue: unknown, importedValue: unknown): VaultData {
  const current = migrateVaultData(currentValue);
  const imported = migrateVaultData(importedValue);
  return {
    version: VAULT_SCHEMA_VERSION,
    keys: mergeRecords(current.keys, imported.keys),
    chats: mergeRecords(current.chats, imported.chats),
    settings: { ...current.settings, ...imported.settings },
  };
}

export async function getVaultSetup(): Promise<VaultSetup | null> {
  const db = await getDb();
  const value = await db.get("vault", "setup");
  return value === undefined ? null : validateSetup(value);
}

export async function hasVaultData(): Promise<boolean> {
  const db = await getDb();
  return (await db.get("vault", "data")) !== undefined;
}

export async function initializeVault(key: CryptoKey, value: unknown, setup: VaultSetup): Promise<void> {
  const normalized = migrateVaultData(value);
  const encrypted = await encryptVaultValue(key, normalized);
  const safeSetup = validateSetup(setup);
  await enqueueWrite(async () => {
    const db = await getDb();
    const transaction = db.transaction("vault", "readwrite");
    await Promise.all([
      transaction.store.put(encrypted, "data"),
      transaction.store.put(safeSetup, "setup"),
      transaction.done,
    ]);
  });
}

export const writeVault = (key: CryptoKey, value: unknown) => {
  const normalized = migrateVaultData(value);
  return enqueueWrite(async () => {
    const db = await getDb();
    const encrypted = await encryptVaultValue(key, normalized);
    await db.put("vault", encrypted, "data");
  });
};

export async function readVault(key: CryptoKey): Promise<VaultData> {
  const db = await getDb();
  const encrypted = (await db.get("vault", "data")) as { iv?: string; ciphertext?: string } | undefined;
  if (!encrypted?.iv || !encrypted?.ciphertext) {
    return { version: VAULT_SCHEMA_VERSION, keys: [], chats: [], settings: {} };
  }
  const saved = await decryptVaultValue(key, { iv: encrypted.iv, ciphertext: encrypted.ciphertext });
  const value = migrateVaultData(saved);
  if (!isRecord(saved) || saved.version !== VAULT_SCHEMA_VERSION) {
    await writeVault(key, value);
  }
  return value;
}

function isDeviceKey(value: unknown): value is CryptoKey {
  return isRecord(value)
    && value.type === "secret"
    && isRecord(value.algorithm)
    && value.algorithm.name === "AES-GCM"
    && Array.isArray(value.usages)
    && value.usages.includes("encrypt")
    && value.usages.includes("decrypt");
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const db = await getDb();
  const storedKey = await db.get("vault", "device-key");
  if (storedKey !== undefined) {
    if (!isDeviceKey(storedKey)) throw new Error("The local workspace encryption key is invalid.");
    return storedKey;
  }

  const generatedKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return enqueueWrite(async () => {
    const database = await getDb();
    const transaction = database.transaction("vault", "readwrite");
    const existing = await transaction.store.get("device-key");
    if (existing !== undefined) {
      await transaction.done;
      if (!isDeviceKey(existing)) throw new Error("The local workspace encryption key is invalid.");
      return existing;
    }
    await transaction.store.put(generatedKey, "device-key");
    await transaction.done;
    return generatedKey;
  });
}

export async function readDeviceVault(key: CryptoKey): Promise<VaultData> {
  const db = await getDb();
  const encrypted: unknown = await db.get("vault", "device-data");
  if (encrypted === undefined) {
    return { version: VAULT_SCHEMA_VERSION, keys: [], chats: [], settings: {} };
  }
  if (!isRecord(encrypted) || typeof encrypted.iv !== "string" || typeof encrypted.ciphertext !== "string") {
    throw new Error("Saved local workspace data has an invalid format.");
  }
  const saved = await decryptVaultValue(key, { iv: encrypted.iv, ciphertext: encrypted.ciphertext });
  const value = migrateVaultData(saved);
  if (!isRecord(saved) || saved.version !== VAULT_SCHEMA_VERSION) {
    await writeDeviceVault(key, value);
  }
  return value;
}

export async function readExistingDeviceVault(): Promise<VaultData | null> {
  const db = await getDb();
  const [storedKey, encrypted] = await Promise.all([
    db.get("vault", "device-key"),
    db.get("vault", "device-data"),
  ]);
  if (encrypted === undefined) return null;
  if (!isDeviceKey(storedKey)) throw new Error("The local workspace encryption key is invalid.");
  return readDeviceVault(storedKey);
}

export async function writeDeviceVault(key: CryptoKey, value: unknown): Promise<void> {
  const normalized = migrateVaultData(value);
  await enqueueWrite(async () => {
    const db = await getDb();
    const encrypted = await encryptVaultValue(key, normalized);
    await db.put("vault", encrypted, "device-data");
  });
}

export async function openDeviceVault(): Promise<{
  key: CryptoKey;
  data: VaultData;
  legacyVaultFound: boolean;
}> {
  const db = await getDb();
  const [legacySetup, legacyData, existingDeviceData] = await Promise.all([
    db.get("vault", "setup"),
    db.get("vault", "data"),
    db.get("vault", "device-data"),
  ]);
  const key = await getOrCreateDeviceKey();
  const legacyVaultFound = existingDeviceData === undefined && (legacySetup !== undefined || legacyData !== undefined);
  const data = await readDeviceVault(key);
  if (existingDeviceData === undefined) await writeDeviceVault(key, data);
  return { key, data, legacyVaultFound };
}

export async function readLockoutRecord(): Promise<LockoutRecord | null> {
  const db = await getDb();
  const value = await db.get("vault", "lockout");
  if (!isRecord(value)) return null;
  const failures = Number(value.failures);
  const until = Number(value.until);
  if (!Number.isSafeInteger(failures) || failures < 0 || !Number.isFinite(until) || until < 0) return null;
  return { failures, until };
}

export async function writeLockoutRecord(value: LockoutRecord): Promise<void> {
  await enqueueWrite(async () => {
    const db = await getDb();
    await db.put("vault", value, "lockout");
  });
}

export const clearVault = async () => {
  await enqueueWrite(async () => {
    const db = await getDb();
    const transaction = db.transaction("vault", "readwrite");
    await Promise.all([
      transaction.store.delete("data"),
      transaction.store.delete("setup"),
      transaction.store.delete("device-data"),
      transaction.store.delete("lockout"),
      transaction.done,
    ]);
  });
};
