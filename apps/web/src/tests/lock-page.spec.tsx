// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lockoutUntil: 0,
  bumpLockout: vi.fn(),
  createVaultCredentials: vi.fn(),
  deriveDataKey: vi.fn(),
  getLockoutRemainingSeconds: vi.fn(),
  getVaultSetup: vi.fn(),
  hasVaultData: vi.fn(),
  initializeLockoutState: vi.fn(),
  initializeVault: vi.fn(),
  isLockoutActive: vi.fn(),
  readExistingDeviceVault: vi.fn(),
  readVault: vi.fn(),
  resetLockoutState: vi.fn(),
  verifyPassword: vi.fn(),
  writeVault: vi.fn(),
}));

vi.mock("../crypto/lockout", () => ({
  bumpLockout: mocks.bumpLockout,
  createVaultCredentials: mocks.createVaultCredentials,
  deriveDataKey: mocks.deriveDataKey,
  getLockoutRemainingSeconds: mocks.getLockoutRemainingSeconds,
  initializeLockoutState: mocks.initializeLockoutState,
  isLockoutActive: mocks.isLockoutActive,
  resetLockoutState: mocks.resetLockoutState,
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("../crypto/legacyConfig", () => ({
  LEGACY_VAULT_SETUP: { version: 0, saltVerify: "old", saltData: "old", verifier: "old" },
}));

vi.mock("@conduit/storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@conduit/storage")>(),
  getVaultSetup: mocks.getVaultSetup,
  hasVaultData: mocks.hasVaultData,
  initializeVault: mocks.initializeVault,
  readExistingDeviceVault: mocks.readExistingDeviceVault,
  readVault: mocks.readVault,
  writeVault: mocks.writeVault,
}));

import { LockPage } from "../pages/Lock";
import { useAppStore } from "../store";

const setup = { version: 1, saltVerify: "verify-salt", saltData: "data-salt", verifier: "verifier" };
const dataKey = {} as CryptoKey;
const savedVault = {
  version: 1,
  keys: [],
  chats: [{ id: "saved", title: "Persisted chat", createdAt: 1, updatedAt: 1, model: "", messages: [] }],
  settings: { theme: "dark" as const },
};

async function settleEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.lockoutUntil = 0;
  mocks.bumpLockout.mockReset().mockImplementation(() => {
    mocks.lockoutUntil = Date.now() + 5_000;
    return Promise.resolve(mocks.lockoutUntil);
  });
  mocks.createVaultCredentials.mockReset().mockResolvedValue({ setup, dataKey });
  mocks.deriveDataKey.mockReset().mockResolvedValue(dataKey);
  mocks.getLockoutRemainingSeconds.mockReset().mockImplementation(() =>
    Math.max(0, Math.ceil((mocks.lockoutUntil - Date.now()) / 1000)),
  );
  mocks.getVaultSetup.mockReset().mockResolvedValue(setup);
  mocks.hasVaultData.mockReset().mockResolvedValue(true);
  mocks.initializeLockoutState.mockReset().mockResolvedValue(undefined);
  mocks.initializeVault.mockReset().mockResolvedValue(undefined);
  mocks.isLockoutActive.mockReset().mockImplementation(() => mocks.getLockoutRemainingSeconds() > 0);
  mocks.readExistingDeviceVault.mockReset().mockResolvedValue(null);
  mocks.readVault.mockReset().mockResolvedValue(savedVault);
  mocks.resetLockoutState.mockReset().mockResolvedValue(undefined);
  mocks.verifyPassword.mockReset().mockResolvedValue(true);
  mocks.writeVault.mockReset().mockResolvedValue(undefined);
  useAppStore.setState({
    unlocked: false,
    dataKey: null,
    conversations: [],
    keys: [],
    theme: "light",
    vaultError: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("lock page", () => {
  it("unlocks the saved vault with the correct password", async () => {
    const user = userEvent.setup();
    render(<LockPage />);
    await settleEffects();

    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(mocks.verifyPassword).toHaveBeenCalledWith("correct-password", setup);
    expect(useAppStore.getState().unlocked).toBe(true);
    expect(useAppStore.getState().dataKey).toBe(dataKey);
    expect(useAppStore.getState().conversations[0]?.title).toBe("Persisted chat");
    expect(useAppStore.getState().theme).toBe("dark");
  });

  it("merges coexisting device data when unlocking a password vault", async () => {
    mocks.readExistingDeviceVault.mockResolvedValue({
      version: 1,
      keys: [],
      chats: [
        { id: "device-only", title: "Device chat", createdAt: 2, updatedAt: 2, model: "", messages: [] },
        { id: "saved", title: "Device duplicate", createdAt: 3, updatedAt: 3, model: "", messages: [] },
      ],
      settings: { soundOn: false },
    });
    const user = userEvent.setup();
    render(<LockPage />);
    await settleEffects();

    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(useAppStore.getState().unlocked).toBe(true));

    const merged = mocks.writeVault.mock.calls[0]?.[1] as typeof savedVault;
    expect(merged.chats).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "saved", title: "Persisted chat" }),
      expect.objectContaining({ id: "device-only", title: "Device chat" }),
    ]));
    expect(merged.chats).toHaveLength(2);
    expect(mocks.writeVault).toHaveBeenCalledWith(dataKey, merged);
    expect(useAppStore.getState().conversations).toEqual(merged.chats);
  });

  it("migrates a legacy vault into a new password-protected vault", async () => {
    mocks.getVaultSetup.mockResolvedValue(null);
    mocks.hasVaultData.mockResolvedValue(true);
    mocks.readExistingDeviceVault.mockResolvedValue({
      version: 1,
      keys: [],
      chats: [
        { id: "device-only", title: "Device chat", createdAt: 2, updatedAt: 2, model: "", messages: [] },
        { id: "saved", title: "Device duplicate", createdAt: 3, updatedAt: 3, model: "", messages: [] },
      ],
      settings: { theme: "light", soundOn: false },
    });
    const user = userEvent.setup();
    render(<LockPage />);
    await settleEffects();

    await user.type(screen.getByLabelText("Existing password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "new-strong-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-strong-password");
    await user.click(screen.getByRole("button", { name: "Migrate vault" }));
    await waitFor(() => expect(useAppStore.getState().unlocked).toBe(true));

    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "old-password",
      expect.objectContaining({ version: 0 }),
    );
    expect(mocks.deriveDataKey).toHaveBeenCalledWith("old-password", "old");
    expect(mocks.readVault).toHaveBeenCalledWith(dataKey);
    const migrated = mocks.initializeVault.mock.calls[0]?.[1] as typeof savedVault;
    expect(migrated.chats).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "saved", title: "Persisted chat" }),
      expect.objectContaining({ id: "device-only", title: "Device chat" }),
    ]));
    expect(migrated.chats).toHaveLength(2);
    expect(migrated.settings).toEqual({ theme: "dark", soundOn: false });
    expect(useAppStore.getState().conversations).toEqual(migrated.chats);
    expect(useAppStore.getState().unlocked).toBe(true);
  });

  it("keeps legacy data available when the migration write fails", async () => {
    mocks.getVaultSetup.mockResolvedValue(null);
    mocks.hasVaultData.mockResolvedValue(true);
    mocks.initializeVault.mockRejectedValue(new Error("Atomic write failed."));
    const user = userEvent.setup();
    render(<LockPage />);
    await settleEffects();

    await user.type(screen.getByLabelText("Existing password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "new-strong-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-strong-password");
    await user.click(screen.getByRole("button", { name: "Migrate vault" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Atomic write failed.");
    expect(mocks.readVault).toHaveBeenCalledWith(dataKey);
    expect(useAppStore.getState().unlocked).toBe(false);
  });

  it("shows failed unlocks and advances the lockout countdown", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<LockPage />);
    await settleEffects();

    await user.type(screen.getByLabelText("Password"), "incorrect-password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(screen.getByRole("alert").textContent).toContain("Incorrect password");
    expect(screen.getByText("You can try again in 0:05")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock" }).hasAttribute("disabled")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(screen.getByText("You can try again in 0:04")).toBeTruthy();
    expect(useAppStore.getState().unlocked).toBe(false);
  });

  it("creates a vault from the first-run form", async () => {
    mocks.getVaultSetup.mockResolvedValue(null);
    mocks.hasVaultData.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<LockPage />);
    await settleEffects();

    await user.type(screen.getByLabelText("Password"), "new-strong-password");
    await user.type(screen.getByLabelText("New password"), "new-strong-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-strong-password");
    await user.click(screen.getByRole("button", { name: "Create vault" }));

    expect(mocks.createVaultCredentials).toHaveBeenCalledWith("new-strong-password");
    expect(mocks.initializeVault).toHaveBeenCalledWith(dataKey, expect.objectContaining({ chats: [] }), setup);
    expect(useAppStore.getState().unlocked).toBe(true);
  });
});
