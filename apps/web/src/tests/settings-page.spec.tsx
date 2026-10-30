// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearConnections: vi.fn(),
  clearVault: vi.fn(),
  createVaultBackup: vi.fn(),
  mergeVaultData: vi.fn(),
  readDeviceVault: vi.fn(),
  readVaultBackup: vi.fn(),
  writeDeviceVault: vi.fn(),
}));

vi.mock("../api", () => ({ clearConnections: mocks.clearConnections }));
vi.mock("@conduit/storage", () => ({
  clearVault: mocks.clearVault,
  readDeviceVault: mocks.readDeviceVault,
  writeDeviceVault: mocks.writeDeviceVault,
}));
vi.mock("../crypto/vaultBackup", () => ({
  createVaultBackup: mocks.createVaultBackup,
  mergeVaultData: mocks.mergeVaultData,
  readVaultBackup: mocks.readVaultBackup,
}));
import { SettingsPage } from "../pages/Settings";
import { defaultUiPreferences, useAppStore } from "../store";

const oldKey = {} as CryptoKey;
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
  mocks.createVaultBackup.mockReset().mockResolvedValue("{}");
  mocks.mergeVaultData.mockReset();
  mocks.readDeviceVault.mockReset().mockResolvedValue(savedVault);
  mocks.readVaultBackup.mockReset();
  mocks.writeDeviceVault.mockReset().mockResolvedValue(undefined);
  useAppStore.setState({
    unlocked: true,
    dataKey: oldKey,
    theme: "light",
    soundOn: true,
    autoLockMinutes: 5,
    preferences: defaultUiPreferences,
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
  it("updates appearance preferences without showing password or lock controls", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(useAppStore.getState().theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Large" }));
    expect(useAppStore.getState().preferences.textSize).toBe("large");
    await user.click(screen.getByRole("switch", { name: "Simple Mode" }));
    expect(useAppStore.getState().preferences.simpleMode).toBe(false);
    expect(screen.queryByText("Change vault password")).toBeNull();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(screen.queryByText("Auto-lock")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock now" })).toBeNull();
  });

  it("clears local chats, connections, and settings after confirmation", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Clear all data" }));
    const dialog = screen.getByRole("dialog");
    const clearButton = within(dialog).getByRole("button", { name: "Clear data" });
    expect(clearButton.hasAttribute("disabled")).toBe(true);
    expect(mocks.clearVault).not.toHaveBeenCalled();
    await user.click(screen.getByText("Advanced confirmation"));
    await user.type(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), "DELETE");
    expect(clearButton.hasAttribute("disabled")).toBe(false);
    await user.click(clearButton);

    expect(mocks.clearConnections).toHaveBeenCalledOnce();
    expect(mocks.clearVault).toHaveBeenCalledOnce();
    expect(useAppStore.getState().conversations).toEqual([]);
    expect(useAppStore.getState().theme).toBe("light");
  });
});
