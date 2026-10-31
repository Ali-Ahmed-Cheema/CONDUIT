import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  const state: { failKey?: string } = {};
  const database = {
    get: vi.fn(async (_store: string, key: string) => records.get(key)),
    put: vi.fn(async (_store: string, value: unknown, key: string) => {
      records.set(key, value);
    }),
    transaction: vi.fn(() => {
      const staged = new Map(records);
      let failed = false;
      const done = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (failed) {
            reject(new Error("Transaction aborted."));
            return;
          }
          records.clear();
          for (const [key, value] of staged) records.set(key, value);
          resolve();
        }, 0);
      });
      return {
        store: {
          get: vi.fn(async (key: string) => staged.get(key)),
          put: vi.fn((value: unknown, key: string) => {
            if (state.failKey === key) {
              failed = true;
              return Promise.reject(new Error("Simulated storage failure."));
            }
            staged.set(key, value);
            return Promise.resolve(key);
          }),
          delete: vi.fn((key: string) => {
            staged.delete(key);
            return Promise.resolve(key);
          }),
        },
        done,
        abort: () => {
          failed = true;
        },
      };
    }),
  };
  return {
    records,
    state,
    openDB: vi.fn().mockResolvedValue(database),
  };
});

vi.mock("idb", () => ({ openDB: fake.openDB }));

import {
  clearVault,
  initializeVault,
  mergeVaultData,
  migrateVaultData,
  openDeviceVault,
  readExistingDeviceVault,
  readVault,
  readDeviceVault,
  writeDeviceVault,
  type VaultSetup,
} from "./vault";
import { decryptVaultValue, encryptVaultValue } from "@conduit/crypto";

function conversation(id: string, title: string) {
  const now = 1_700_000_000_000;
  return { id, title, createdAt: now, updatedAt: now, model: "", messages: [] };
}

function setup(seed: string): VaultSetup {
  return {
    version: 1,
    saltVerify: `${seed.repeat(32).slice(0, 32)}`,
    saltData: `${seed.repeat(32).slice(0, 32)}`,
    verifier: `${seed.repeat(64).slice(0, 64)}`,
  };
}

async function dataKey(seed: number): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).fill(seed),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

beforeEach(() => {
  fake.records.clear();
  fake.state.failKey = undefined;
  vi.clearAllMocks();
});

describe("vault schema and persistence", () => {
  it("migrates existing unversioned data without dropping chats or settings", () => {
    expect(migrateVaultData({
      chats: [conversation("legacy", "Legacy chat")],
      settings: { theme: "dark" },
    })).toEqual({
      version: 1,
      keys: [],
      chats: [conversation("legacy", "Legacy chat")],
      settings: { theme: "dark" },
    });
  });

  it("merges user memories while keeping the local name when backups conflict", () => {
    expect(mergeVaultData(
      { chats: [], settings: { userMemories: ["The user's name is Ali.", "The user prefers concise answers."] } },
      { chats: [], settings: { userMemories: ["The user's name is Sam.", "The user likes examples."] } },
    ).settings.userMemories).toEqual([
      "The user likes examples.",
      "The user's name is Ali.",
      "The user prefers concise answers.",
    ]);
  });

  it("rejects malformed or unsupported vault schemas", () => {
    expect(() => migrateVaultData({ version: 99 })).toThrow("unsupported schema version");
    expect(() => migrateVaultData({ chats: "not-an-array" })).toThrow("invalid format");
  });

  it("upgrades old encrypted vault data to the versioned schema", async () => {
    const key = await dataKey(1);
    fake.records.set("data", await encryptVaultValue(key, {
      chats: [conversation("legacy", "Legacy chat")],
      settings: { theme: "dark" },
    }));

    const saved = await readVault(key);
    const stored = fake.records.get("data") as { iv: string; ciphertext: string };

    expect(saved).toMatchObject({ version: 1, settings: { theme: "dark" } });
    expect(await decryptVaultValue(key, stored)).toMatchObject({ version: 1 });
  });

  it("keeps the previous data and password setup if atomic replacement fails", async () => {
    const oldKey = await dataKey(2);
    const nextKey = await dataKey(3);
    const oldSetup = setup("a");
    const nextSetup = setup("b");
    const oldVault = { version: 1, keys: [], chats: [conversation("saved", "Saved")], settings: { theme: "dark" } };
    await initializeVault(oldKey, oldVault, oldSetup);
    const previousData = fake.records.get("data");
    const previousSetup = fake.records.get("setup");
    fake.state.failKey = "setup";

    await expect(initializeVault(nextKey, {
      version: 1,
      keys: [],
      chats: [],
      settings: {},
    }, nextSetup)).rejects.toThrow("Simulated storage failure");

    expect(fake.records.get("data")).toEqual(previousData);
    expect(fake.records.get("setup")).toEqual(previousSetup);
  });

  it("migrates a password vault while preserving coexisting device-vault records", async () => {
    const oldKey = await dataKey(4);
    const newKey = await dataKey(5);
    const oldSetup = setup("d");
    const newSetup = setup("e");
    const legacyData = {
      version: 1,
      keys: [],
      chats: [conversation("password-chat", "Password chat")],
      settings: { theme: "dark" },
    };
    const deviceData = {
      version: 1,
      keys: [],
      chats: [conversation("device-chat", "Device chat")],
      settings: { soundOn: false },
    };
    fake.records.set("setup", oldSetup);
    fake.records.set("data", await encryptVaultValue(oldKey, legacyData));
    const device = await openDeviceVault();
    await writeDeviceVault(device.key, deviceData);
    const originalDeviceRecord = fake.records.get("device-data");

    const decryptedLegacy = await readVault(oldKey);
    const encryptedDevice = await readExistingDeviceVault();
    expect(encryptedDevice).not.toBeNull();
    const merged = mergeVaultData(encryptedDevice, decryptedLegacy);
    await initializeVault(newKey, merged, newSetup);

    expect(await readVault(newKey)).toEqual({
      version: 1,
      keys: [],
      chats: expect.arrayContaining([
        expect.objectContaining({ id: "password-chat", title: "Password chat" }),
        expect.objectContaining({ id: "device-chat", title: "Device chat" }),
      ]),
      settings: { soundOn: false, theme: "dark" },
    });
    expect(fake.records.get("setup")).toEqual(newSetup);
    expect(fake.records.get("device-data")).toBe(originalDeviceRecord);
  });

  it("opens a password-free workspace while preserving an existing password vault", async () => {
    const oldData = { iv: "old-iv", ciphertext: "old-ciphertext" };
    const oldSetup = setup("c");
    fake.records.set("data", oldData);
    fake.records.set("setup", oldSetup);

    const workspace = await openDeviceVault();

    expect(workspace.legacyVaultFound).toBe(true);
    expect(workspace.data.chats).toEqual([]);
    expect(fake.records.get("data")).toBe(oldData);
    expect(fake.records.get("setup")).toBe(oldSetup);
    expect(fake.records.get("device-key")).toBe(workspace.key);
    expect(fake.records.has("device-data")).toBe(true);
  });

  it("persists local workspace data using the generated device key", async () => {
    const { key } = await openDeviceVault();
    const expected = {
      version: 1,
      keys: [],
      chats: [conversation("device", "Device chat")],
      settings: { theme: "dark" },
    };

    await writeDeviceVault(key, expected);

    expect(await readDeviceVault(key)).toEqual(expected);
    expect(await readExistingDeviceVault()).toEqual(expected);
  });

  it("returns no device vault when no device data has been saved", async () => {
    expect(await readExistingDeviceVault()).toBeNull();
  });

  it("removes the generated device key when clearing the vault", async () => {
    const workspace = await openDeviceVault();
    const expected = {
      version: 1,
      keys: [],
      chats: [conversation("device", "Device chat")],
      settings: { theme: "dark" },
    };
    await writeDeviceVault(workspace.key, expected);

    await clearVault();

    expect(fake.records.has("device-key")).toBe(false);
    expect(fake.records.has("device-data")).toBe(false);
    expect(fake.records.has("data")).toBe(false);
    expect(fake.records.has("setup")).toBe(false);
  });

  it("does not treat device data without its encryption key as an empty vault", async () => {
    fake.records.set("device-data", { iv: "ciphertext", ciphertext: "ciphertext" });

    await expect(readExistingDeviceVault()).rejects.toThrow("encryption key is invalid");
  });
});
