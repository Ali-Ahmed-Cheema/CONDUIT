// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "Development" } });
    fireEvent.change(screen.getByLabelText("Your AI key"), { target: { value: "sk-mock-provider-key" } });
    expect(screen.getByText(/Likely API type: OpenAI chat service/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Check and save" }));

    expect(mocks.validateKey).toHaveBeenCalledWith("sk-mock-provider-key", false, "Development");
    expect(mocks.addConnection).toHaveBeenCalledWith("validation");
    expect((await screen.findByRole("status")).textContent).toContain("OpenAI connection validated and saved.");
    expect(useAppStore.getState().activeConnectionId).toBe(first.id);
  });

  it.each([
    ["sk-ant-test-key", "Anthropic"],
    ["AIza-test-key", "Google Gemini"],
    ["sk-or-test-key", "OpenRouter"],
    ["hf_test-key", "Hugging Face"],
    ["gsk_test-key", "Groq"],
  ])("identifies %s as a likely %s chat key while typing", async (key, providerName) => {
    renderConfig();

    fireEvent.change(screen.getByLabelText("Your AI key"), { target: { value: key } });

    expect(screen.getByText(`Likely API type: ${providerName} chat service. The key will be verified before it is saved.`)).toBeTruthy();
  });

  it("requires explicit consent before probing an unknown provider key", async () => {
    const user = userEvent.setup();
    renderConfig();
    await screen.findByText(/No API connections saved/);

    fireEvent.change(screen.getByLabelText("Your AI key"), { target: { value: "custom-provider-key" } });
    expect(screen.getByText(/Payment, cloud, database, and other non-chat API keys need dedicated integrations/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Check and save" }));
    expect(mocks.validateKey).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("cannot identify the AI service");

    await user.click(screen.getByRole("checkbox", { name: /consent to sending this key/i }));
    await user.click(screen.getByRole("button", { name: "Check and save" }));
    expect(mocks.validateKey).toHaveBeenCalledWith("custom-provider-key", true, "Default");
  });

  it("replaces a selected connection only after validating the replacement key", async () => {
    mocks.getConnections.mockResolvedValue(response([first], first.id));
    const user = userEvent.setup();
    renderConfig();
    const card = await screen.findByRole("article");

    await user.click(within(card).getByRole("button", { name: "Replace key" }));
    fireEvent.change(screen.getByLabelText("Replacement key for OpenAI"), { target: { value: "sk-replacement-key" } });
    await user.click(screen.getByRole("button", { name: "Check and replace" }));

    expect(mocks.validateKey).toHaveBeenCalledWith("sk-replacement-key", false, "Default");
    expect(mocks.replaceConnection).toHaveBeenCalledWith(first.id, "validation");
  });

  it("groups saved API connections by environment and keeps legacy keys in Default", async () => {
    const development = { ...first, id: "development", environment: "Development" };
    const production = { ...second, environment: "Production" };
    mocks.getConnections.mockResolvedValue(response([first, development, production], first.id));
    renderConfig();

    expect(await screen.findByRole("region", { name: "Default environment" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Development environment" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Production environment" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Development environment" })).getByRole("heading", { name: "OpenAI" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Production environment" })).getByRole("heading", { name: "OpenAI second" })).toBeTruthy();
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
