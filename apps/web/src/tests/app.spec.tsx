// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openDeviceVault: vi.fn(),
  writeDeviceVault: vi.fn(),
}));

vi.mock("@conduit/storage", () => ({
  openDeviceVault: mocks.openDeviceVault,
  writeDeviceVault: mocks.writeDeviceVault,
}));

vi.mock("../pages/Chat", () => ({
  ChatPage: () => <div>Chat workspace</div>,
}));

import App from "../App";
import { defaultUiPreferences, useAppStore } from "../store";

const dataKey = {} as CryptoKey;

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  mocks.openDeviceVault.mockReset().mockResolvedValue({
    key: dataKey,
    data: { version: 1, keys: [], chats: [], settings: {} },
    legacyVaultFound: false,
  });
  mocks.writeDeviceVault.mockReset().mockResolvedValue(undefined);
  useAppStore.setState({
    unlocked: false,
    dataKey: null,
    conversations: [],
    theme: "light",
    soundOn: true,
    autoLockMinutes: 5,
    preferences: defaultUiPreferences,
    vaultError: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("application startup", () => {
  it("opens the chat workspace without the comfort screen", async () => {
    render(<App />);

    expect(await screen.findByText("Chat workspace")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Make it comfortable" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue to chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByText("Your private space")).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlock" })).toBeNull();
    expect(mocks.openDeviceVault).toHaveBeenCalledOnce();
    expect(useAppStore.getState().dataKey).toBe(dataKey);
    expect(useAppStore.getState().unlocked).toBe(true);
    expect(useAppStore.getState().preferences.comfortSetupComplete).toBe(true);

    await waitFor(() => {
      expect(mocks.writeDeviceVault).toHaveBeenLastCalledWith(
        dataKey,
        expect.objectContaining({
          settings: expect.objectContaining({
            preferences: expect.objectContaining({
              comfortSetupComplete: true,
            }),
          }),
        }),
      );
    });
  });

  it("opens the local workspace without a password prompt when legacy encrypted data exists", async () => {
    mocks.openDeviceVault.mockResolvedValueOnce({
      key: dataKey,
      data: { version: 1, keys: [], chats: [], settings: {} },
      legacyVaultFound: true,
    });

    render(<App />);

    await waitFor(() => expect(useAppStore.getState().unlocked).toBe(true));
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(mocks.openDeviceVault).toHaveBeenCalledOnce();
    expect(screen.queryByText("Your private space")).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlock" })).toBeNull();
  });
});
