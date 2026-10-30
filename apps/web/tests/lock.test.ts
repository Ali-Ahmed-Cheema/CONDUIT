/// <reference lib="dom" />

import { afterEach, describe, expect, it, vi } from "vitest";

const { writeVault } = vi.hoisted(() => ({ writeVault: vi.fn() }));

vi.mock("@conduit/storage", () => ({ writeVault }));

import { useAppStore } from "../src/store";
import { lockApp } from "../src/lib/lock";

afterEach(() => {
  vi.clearAllMocks();
});

describe("locking the app", () => {
  it("keeps the vault unlocked when the final save fails", async () => {
    const dataKey = {} as CryptoKey;
    writeVault.mockRejectedValueOnce(new Error("IndexedDB is unavailable"));
    useAppStore.setState({
      unlocked: true,
      dataKey,
      conversations: [],
      vaultError: null,
    });

    await lockApp();

    expect(useAppStore.getState().unlocked).toBe(true);
    expect(useAppStore.getState().dataKey).toBe(dataKey);
    expect(useAppStore.getState().vaultError).toContain("IndexedDB is unavailable");
  });

  it("clears the in-memory key after a successful final save", async () => {
    const dataKey = {} as CryptoKey;
    writeVault.mockResolvedValueOnce(undefined);
    useAppStore.setState({
      unlocked: true,
      dataKey,
      conversations: [],
      vaultError: "previous error",
    });

    await lockApp();

    expect(useAppStore.getState().unlocked).toBe(false);
    expect(useAppStore.getState().dataKey).toBeNull();
    expect(useAppStore.getState().vaultError).toBeNull();
  });
});
