import { deriveDataKey } from "./lockout";
import { decryptVaultValue, encryptVaultValue, migrateVaultData, type VaultData } from "./vault";

const FORMAT = "CONDUIT_VAULT_BACKUP";
const VERSION = 1;
const KDF_ITERATIONS = 210_000;

interface BackupDocument {
  format: typeof FORMAT;
  version: typeof VERSION;
  kdf: {
    name: "PBKDF2-SHA-256";
    iterations: typeof KDF_ITERATIONS;
    salt: string;
  };
  encrypted: {
    iv: string;
    ciphertext: string;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function randomSalt(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function createVaultBackup(value: unknown, password: string): Promise<string> {
  const salt = randomSalt();
  const key = await deriveDataKey(password, salt);
  const encrypted = await encryptVaultValue(key, migrateVaultData(value));
  const backup: BackupDocument = {
    format: FORMAT,
    version: VERSION,
    kdf: {
      name: "PBKDF2-SHA-256",
      iterations: KDF_ITERATIONS,
      salt,
    },
    encrypted,
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

function parseBackup(contents: string): BackupDocument {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("The selected backup is not valid JSON.");
  }
  if (
    !isRecord(value) ||
    value.format !== FORMAT ||
    value.version !== VERSION ||
    !isRecord(value.kdf) ||
    value.kdf.name !== "PBKDF2-SHA-256" ||
    value.kdf.iterations !== KDF_ITERATIONS ||
    typeof value.kdf.salt !== "string" ||
    !/^[0-9a-f]{32}$/i.test(value.kdf.salt) ||
    !isRecord(value.encrypted) ||
    typeof value.encrypted.iv !== "string" ||
    !/^[0-9a-f]{24}$/i.test(value.encrypted.iv) ||
    typeof value.encrypted.ciphertext !== "string" ||
    !/^(?:[0-9a-f]{2})+$/i.test(value.encrypted.ciphertext)
  ) {
    throw new Error("The selected file is not a supported CONDUIT vault backup.");
  }
  return {
    format: FORMAT,
    version: VERSION,
    kdf: {
      name: "PBKDF2-SHA-256",
      iterations: KDF_ITERATIONS,
      salt: value.kdf.salt,
    },
    encrypted: {
      iv: value.encrypted.iv,
      ciphertext: value.encrypted.ciphertext,
    },
  };
}

export async function readVaultBackup(contents: string, password: string): Promise<VaultData> {
  const backup = parseBackup(contents);
  try {
    const key = await deriveDataKey(password, backup.kdf.salt);
    const decrypted = await decryptVaultValue(key, backup.encrypted);
    return migrateVaultData(decrypted);
  } catch {
    throw new Error("The backup password is incorrect or the backup data is damaged.");
  }
}

function recordId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === "string" ? value.id : undefined;
}

function mergeRecords(current: unknown[], imported: unknown[]): unknown[] {
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
    version: VERSION,
    keys: mergeRecords(current.keys, imported.keys),
    chats: mergeRecords(current.chats, imported.chats),
    settings: { ...current.settings, ...imported.settings },
  };
}
