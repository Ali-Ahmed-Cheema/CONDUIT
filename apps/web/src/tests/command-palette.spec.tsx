// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CommandPalette } from "../components/CommandPalette";
import { defaultUiPreferences, useAppStore } from "../store";

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

beforeEach(() => {
  useAppStore.setState({
    conversations: [],
    activeConversationId: null,
    theme: "light",
    preferences: defaultUiPreferences,
  });
});

afterEach(() => {
  cleanup();
});

function renderPalette(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CommandPalette />
      <CurrentPath />
    </MemoryRouter>,
  );
}

describe("command palette", () => {
  it("opens with Ctrl+K and supports keyboard navigation", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search commands and conversations" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search commands and conversations" }), { key: "Enter" });

    expect(screen.getByLabelText("Current path").textContent).toBe("/history");
  });

  it("finds and opens matching conversations", () => {
    useAppStore.setState({
      conversations: [{
        id: "chat-1",
        title: "Quarterly planning",
        model: "test-model",
        createdAt: 1,
        updatedAt: 1,
        messages: [{ id: "message-1", role: "user", content: "Review the launch schedule", ts: 1 }],
      }],
    });
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Search commands and conversations" }), { target: { value: "launch schedule" } });
    fireEvent.click(screen.getByRole("option", { name: /Quarterly planning/ }));

    expect(useAppStore.getState().activeConversationId).toBe("chat-1");
    expect(screen.getByLabelText("Current path").textContent).toBe("/");
  });

  it("applies a matching appearance preference", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Search commands and conversations" }), { target: { value: "high contrast" } });
    fireEvent.click(screen.getByRole("option", { name: /Turn on high contrast/ }));

    expect(useAppStore.getState().preferences.highContrast).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts a fresh chat and opens settings with global shortcuts", () => {
    useAppStore.setState({ activeConversationId: "previous-chat" });
    renderPalette("/history");

    fireEvent.keyDown(window, { key: "n", ctrlKey: true, shiftKey: true });
    expect(useAppStore.getState().activeConversationId).toBeNull();
    expect(screen.getByLabelText("Current path").textContent).toBe("/");

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    expect(screen.getByLabelText("Current path").textContent).toBe("/settings");
  });
});
