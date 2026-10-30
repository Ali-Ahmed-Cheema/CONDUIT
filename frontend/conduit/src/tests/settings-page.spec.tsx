// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearConnections: vi.fn(),
  clearVault: vi.fn(),
  createVaultCredentials: vi.fn(),
  createVaultBackup: vi.fn(),
  deriveDataKey: vi.fn(),
  getVaultSetup: vi.fn(),
  initializeVault: vi.fn(),
  lockApp: vi.fn(),
  mergeVaultData: vi.fn(),
  readVault: vi.fn(),
  readVaultBackup: vi.fn(),
  resetLockoutState: vi.fn(),
  verifyPassword: vi.fn(),
  writeVault: vi.fn(),
}));

vi.mock("../api", () => ({ clearConnections: mocks.clearConnections }));
vi.mock("../crypto/lockout", () => ({
  createVaultCredentials: mocks.createVaultCredentials,
  deriveDataKey: mocks.deriveDataKey,
  resetLockoutState: mocks.resetLockoutState,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("../crypto/vault", () => ({
  clearVault: mocks.clearVault,
  getVaultSetup: mocks.getVaultSetup,
  initializeVault: mocks.initializeVault,
  readVault: mocks.readVault,
  writeVault: mocks.writeVault,
}));
vi.mock("../crypto/vaultBackup", () => ({
  createVaultBackup: mocks.createVaultBackup,
  mergeVaultData: mocks.mergeVaultData,
  readVaultBackup: mocks.readVaultBackup,
}));
vi.mock("../lib/lock", () => ({ lockApp: mocks.lockApp }));

import { SettingsPage } from "../pages/Settings";
import { useAppStore } from "../store";

const oldKey = {} as CryptoKey;
const newKey = {} as CryptoKey;
const setup = { version: 1, saltVerify: "old-salt", saltData: "old-data-salt", verifier: "old-verifier" };
const nextSetup = { version: 1, saltVerify: "new-salt", saltData: "new-data-salt", verifier: "new-verifier" };
const savedVault = {
  version: 1,
  keys: [],
  chats: [{ id: "saved", title: "Existing conversation", createdAt: 1, updatedAt: 1, model: "", messages: [] }],
  settings: { theme: "dark" as const },
};

function renderSettings() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  mocks.clearConnections.mockReset().mockResolvedValue(undefined);
  mocks.clearVault.mockReset().mockResolvedValue(undefined);
  mocks.createVaultCredentials.mockReset().mockResolvedValue({ setup: nextSetup, dataKey: newKey });
  mocks.createVaultBackup.mockReset().mockResolvedValue("{}");
  mocks.deriveDataKey.mockReset().mockResolvedValue(oldKey);
  mocks.getVaultSetup.mockReset().mockResolvedValue(setup);
  mocks.initializeVault.mockReset().mockResolvedValue(undefined);
  mocks.lockApp.mockReset().mockResolvedValue(undefined);
  mocks.mergeVaultData.mockReset();
  mocks.readVault.mockReset().mockResolvedValue(savedVault);
  mocks.readVaultBackup.mockReset();
  mocks.resetLockoutState.mockReset().mockResolvedValue(undefined);
  mocks.verifyPassword.mockReset().mockResolvedValue(true);
  mocks.writeVault.mockReset().mockResolvedValue(undefined);
  useAppStore.setState({
    unlocked: true,
    dataKey: oldKey,
    theme: "light",
    soundOn: true,
    autoLockMinutes: 5,
    conversations: savedVault.chats,
    keys: [],
    connections: [],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("settings page", () => {
  it("updates theme and auto-lock choices in the app store", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: "Never" }));

    expect(useAppStore.getState().theme).toBe("dark");
    expect(useAppStore.getState().autoLockMinutes).toBe(0);
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("re-encrypts the vault after verifying the current password", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(screen.getByLabelText("Current password"), "current-password");
    await user.type(screen.getByLabelText("New password"), "new-password-with-strength");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-with-strength");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(mocks.verifyPassword).toHaveBeenCalledWith("current-password", setup);
    expect(mocks.deriveDataKey).toHaveBeenCalledWith("current-password", setup.saltData);
    expect(mocks.initializeVault).toHaveBeenCalledWith(newKey, savedVault, nextSetup);
    expect(useAppStore.getState().dataKey).toBe(newKey);
    expect(screen.getByRole("status").textContent).toContain("Password changed");
  });

  it("keeps the active key when password replacement fails atomically", async () => {
    mocks.initializeVault.mockRejectedValueOnce(new Error("Atomic replacement failed."));
    const user = userEvent.setup();
    renderSettings();

    await user.type(screen.getByLabelText("Current password"), "current-password");
    await user.type(screen.getByLabelText("New password"), "new-password-with-strength");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-with-strength");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Atomic replacement failed.");
    expect(useAppStore.getState().dataKey).toBe(oldKey);
    expect(useAppStore.getState().unlocked).toBe(true);
  });

  it("clears local chats, connections, and settings after confirmation", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Clear all data" }));

    expect(mocks.clearConnections).toHaveBeenCalledOnce();
    expect(mocks.clearVault).toHaveBeenCalledOnce();
    expect(mocks.resetLockoutState).toHaveBeenCalledOnce();
    expect(useAppStore.getState().conversations).toEqual([]);
    expect(useAppStore.getState().theme).toBe("light");
  });
});
