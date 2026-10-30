import {
  VAULT_BACKUP_FORMAT,
  VAULT_BACKUP_KDF_ITERATIONS,
  VAULT_BACKUP_VERSION,
  VaultBackupSchema,
  type VaultBackupContract,
} from "@conduit/core";
import { deriveDataKey } from "./lockout";
import { decryptVaultValue, encryptVaultValue } from "@conduit/crypto";
import { migrateVaultData, type VaultData } from "@conduit/storage";

export { mergeVaultData } from "@conduit/storage";

type BackupDocument = VaultBackupContract;

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
    format: VAULT_BACKUP_FORMAT,
    version: VAULT_BACKUP_VERSION,
    kdf: {
      name: "PBKDF2-SHA-256",
      iterations: VAULT_BACKUP_KDF_ITERATIONS,
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
  const parsed = VaultBackupSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("The selected file is not a supported CONDUIT vault backup.");
  }
  return parsed.data;
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
