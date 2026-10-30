import { openDB } from "idb";

export const VAULT_SCHEMA_VERSION = 1;

export interface VaultSetup {
  version: 1;
  saltVerify: string;
  verifier: string;
  saltData: string;
}

export interface VaultData {
  version: 1;
  keys: unknown[];
  chats: unknown[];
  settings: Record<string, unknown>;
}

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

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("Saved vault data contains invalid hexadecimal data.");
  return new Uint8Array(hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

function validateSetup(value: unknown): VaultSetup {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.saltVerify !== "string" ||
    !/^[0-9a-f]{32}$/i.test(value.saltVerify) ||
    typeof value.saltData !== "string" ||
    !/^[0-9a-f]{32}$/i.test(value.saltData) ||
    typeof value.verifier !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.verifier)
  ) {
    throw new Error("Saved password setup is malformed.");
  }
  return {
    version: 1,
    saltVerify: value.saltVerify,
    saltData: value.saltData,
    verifier: value.verifier,
  };
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
  return {
    version: VAULT_SCHEMA_VERSION,
    keys: (payload.keys as unknown[] | undefined) ?? [],
    chats,
    settings: (payload.settings as Record<string, unknown> | undefined) ?? {},
  };
}

export const encryptVaultValue = async (key: CryptoKey, payload: unknown) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return {
    iv: toHex(iv),
    ciphertext: toHex(new Uint8Array(ciphertext)),
  };
};

export const decryptVaultValue = async (key: CryptoKey, payload: { iv: string; ciphertext: string }) => {
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(payload.iv) },
    key,
    fromHex(payload.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

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
      transaction.store.delete("lockout"),
      transaction.done,
    ]);
  });
};
