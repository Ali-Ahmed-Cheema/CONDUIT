import { beforeEach, describe, expect, it, vi } from "vitest";

const { deriveDataKey } = vi.hoisted(() => ({ deriveDataKey: vi.fn() }));
vi.mock("./lockout", () => ({ deriveDataKey }));

import { createVaultBackup, mergeVaultData, readVaultBackup } from "./vaultBackup";

let key: CryptoKey;

function conversation(id: string, title: string) {
  const now = 1_700_000_000_000;
  return { id, title, createdAt: now, updatedAt: now, model: "", messages: [] };
}

beforeEach(async () => {
  key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).fill(11),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  deriveDataKey.mockResolvedValue(key);
});

describe("encrypted vault backups", () => {
  it("round-trips an encrypted, versioned backup without exposing its contents", async () => {
    const data = {
      version: 1,
      keys: [],
      chats: [conversation("chat-1", "Private title")],
      settings: { theme: "dark" },
    };
    const serialized = await createVaultBackup(data, "test-password");
    const parsed = JSON.parse(serialized) as { format: string; version: number };
    const restored = await readVaultBackup(serialized, "test-password");

    expect(parsed).toMatchObject({ format: "CONDUIT_VAULT_BACKUP", version: 1 });
    expect(serialized).not.toContain("Private title");
    expect(restored).toMatchObject(data);
  });

  it("rejects invalid formats and wrong passwords", async () => {
    await expect(readVaultBackup("{}", "password")).rejects.toThrow("not a supported CONDUIT");
    const serialized = await createVaultBackup({ chats: [], settings: {} }, "password");
    const wrongKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(12),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
    deriveDataKey.mockResolvedValueOnce(wrongKey);

    await expect(readVaultBackup(serialized, "wrong")).rejects.toThrow("password is incorrect");
  });

  it("merges imported chats by id while preserving local chats and settings", () => {
    const merged = mergeVaultData(
      {
        chats: [conversation("shared", "old"), conversation("local", "local")],
        settings: { theme: "light", soundOn: true },
      },
      {
        chats: [conversation("shared", "new"), conversation("imported", "imported")],
        settings: { theme: "dark" },
      },
    );

    expect(merged.chats).toEqual([
      conversation("shared", "new"),
      conversation("imported", "imported"),
      conversation("local", "local"),
    ]);
    expect(merged.settings).toEqual({ theme: "dark", soundOn: true });
  });
});
