// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addConnection: vi.fn(),
  getConnections: vi.fn(),
  refreshConnection: vi.fn(),
  removeConnection: vi.fn(),
  replaceConnection: vi.fn(),
  setActiveConnection: vi.fn(),
  validateKey: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    addConnection: mocks.addConnection,
    getConnections: mocks.getConnections,
    refreshConnection: mocks.refreshConnection,
    removeConnection: mocks.removeConnection,
    replaceConnection: mocks.replaceConnection,
    setActiveConnection: mocks.setActiveConnection,
    validateKey: mocks.validateKey,
  };
});

import { ApiConfigPage } from "../pages/ApiConfig";
import { useAppStore } from "../store";
import type { Connection, ConnectionsResponse } from "../types";

const first: Connection = {
  id: "first",
  provider: "openai",
  providerName: "OpenAI",
  keyHint: "********1234",
  models: ["gpt-test"],
  addedAt: "2026-01-01T00:00:00.000Z",
  lastValidatedAt: "2026-01-01T00:00:00.000Z",
  status: "valid",
};
const second: Connection = {
  ...first,
  id: "second",
  providerName: "OpenAI second",
  keyHint: "********5678",
  models: ["gpt-test", "gpt-next"],
};

function response(connections: Connection[], activeId: string | null): ConnectionsResponse {
  return { connections, activeId };
}

function renderConfig() {
  return render(<MemoryRouter><ApiConfigPage /></MemoryRouter>);
}

beforeEach(() => {
  mocks.addConnection.mockReset().mockResolvedValue(response([first], first.id));
  mocks.getConnections.mockReset().mockResolvedValue(response([], null));
  mocks.refreshConnection.mockReset().mockResolvedValue(response([first], first.id));
  mocks.removeConnection.mockReset().mockResolvedValue(response([], null));
  mocks.replaceConnection.mockReset().mockResolvedValue(response([first], first.id));
  mocks.setActiveConnection.mockReset().mockResolvedValue(response([first, second], second.id));
  mocks.validateKey.mockReset().mockResolvedValue({
    validationId: "validation",
    provider: "openai",
    providerName: "OpenAI",
    models: ["gpt-test"],
    chatModels: ["gpt-test"],
  });
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  useAppStore.setState({
    connections: [],
    activeConnectionId: null,
    activeModel: "",
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("API config page", () => {
  it("validates and adds a recognized connection", async () => {
    const user = userEvent.setup();
    renderConfig();
    await screen.findByText(/No API connections saved/);

    await user.type(screen.getByLabelText("API key"), "sk-mock-provider-key");
    await user.click(screen.getByRole("button", { name: "Validate & add" }));

    expect(mocks.validateKey).toHaveBeenCalledWith("sk-mock-provider-key", false);
    expect(mocks.addConnection).toHaveBeenCalledWith("validation");
    expect((await screen.findByRole("status")).textContent).toContain("OpenAI connection validated and saved.");
    expect(useAppStore.getState().activeConnectionId).toBe(first.id);
  });

  it("requires explicit consent before probing an unknown provider key", async () => {
    const user = userEvent.setup();
    renderConfig();
    await screen.findByText(/No API connections saved/);

    await user.type(screen.getByLabelText("API key"), "custom-provider-key");
    await user.click(screen.getByRole("button", { name: "Validate & add" }));
    expect(mocks.validateKey).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("provider cannot be identified");

    await user.click(screen.getByRole("checkbox", { name: /consent to checking/i }));
    await user.click(screen.getByRole("button", { name: "Validate & add" }));
    expect(mocks.validateKey).toHaveBeenCalledWith("custom-provider-key", true);
  });

  it("replaces a selected connection only after validating the replacement key", async () => {
    mocks.getConnections.mockResolvedValue(response([first], first.id));
    const user = userEvent.setup();
    renderConfig();
    const card = await screen.findByRole("article");

    await user.click(within(card).getByRole("button", { name: "Replace key" }));
    await user.type(screen.getByLabelText("Replacement key for OpenAI"), "sk-replacement-key");
    await user.click(screen.getByRole("button", { name: "Validate & replace" }));

    expect(mocks.validateKey).toHaveBeenCalledWith("sk-replacement-key", false);
    expect(mocks.replaceConnection).toHaveBeenCalledWith(first.id, "validation");
  });

  it("activates, refreshes, and deletes a saved connection with clear feedback", async () => {
    mocks.getConnections.mockResolvedValue(response([first, second], first.id));
    mocks.refreshConnection.mockResolvedValue(response(
      [{ ...second, models: ["gpt-test", "gpt-next"], status: "valid" }, first],
      second.id,
    ));
    mocks.removeConnection.mockResolvedValue(response([first], first.id));
    const user = userEvent.setup();
    renderConfig();
    await screen.findByRole("heading", { name: "OpenAI second" });
    const secondCard = screen.getByRole("heading", { name: "OpenAI second" }).closest("article");
    if (!secondCard) throw new Error("The second connection card was not rendered.");

    await user.click(within(secondCard).getByRole("button", { name: "Use this key" }));
    expect(mocks.setActiveConnection).toHaveBeenCalledWith(second.id);
    expect((await screen.findByRole("status")).textContent).toContain("OpenAI second is now active.");

    const activeCard = screen.getByRole("heading", { name: "OpenAI second" }).closest("article");
    if (!activeCard) throw new Error("The active connection card was not rendered.");
    await user.click(within(activeCard).getByRole("button", { name: "Refresh validation" }));
    expect(mocks.refreshConnection).toHaveBeenCalledWith(second.id);
    expect((await screen.findByRole("status")).textContent).toContain("Refreshed 2 chat models for OpenAI second.");

    const refreshedCard = screen.getByRole("heading", { name: "OpenAI second" }).closest("article");
    if (!refreshedCard) throw new Error("The refreshed connection card was not rendered.");
    await user.click(within(refreshedCard).getByRole("button", { name: "Delete" }));
    expect(mocks.removeConnection).toHaveBeenCalledWith(second.id);
    expect((await screen.findByRole("status")).textContent).toContain("API connection deleted.");
  });
});
