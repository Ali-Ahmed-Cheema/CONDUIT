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
      const done = Promise.resolve().then(() => {
        if (failed) throw new Error("Transaction aborted.");
        records.clear();
        for (const [key, value] of staged) records.set(key, value);
      });
      return {
        store: {
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
  encryptVaultValue,
  initializeVault,
  migrateVaultData,
  readVault,
  type VaultSetup,
} from "./vault";

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
    expect(await (await import("./vault")).decryptVaultValue(key, stored)).toMatchObject({ version: 1 });
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
});
