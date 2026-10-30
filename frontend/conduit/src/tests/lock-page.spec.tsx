// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
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
  readVault: vi.fn(),
  resetLockoutState: vi.fn(),
  verifyPassword: vi.fn(),
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

vi.mock("../crypto/vault", () => ({
  getVaultSetup: mocks.getVaultSetup,
  hasVaultData: mocks.hasVaultData,
  initializeVault: mocks.initializeVault,
  readVault: mocks.readVault,
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
  mocks.readVault.mockReset().mockResolvedValue(savedVault);
  mocks.resetLockoutState.mockReset().mockResolvedValue(undefined);
  mocks.verifyPassword.mockReset().mockResolvedValue(true);
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

  it("shows failed unlocks and advances the lockout countdown", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<LockPage />);
    await settleEffects();

    await user.type(screen.getByLabelText("Password"), "incorrect-password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(screen.getByRole("alert").textContent).toContain("Incorrect password");
    expect(screen.getByText("Locked for 5s")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock" }).hasAttribute("disabled")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(screen.getByText("Locked for 4s")).toBeTruthy();
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
