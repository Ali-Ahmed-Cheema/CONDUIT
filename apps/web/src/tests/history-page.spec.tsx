// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryPage } from "../pages/History";
import { useAppStore, type ChatConversation } from "../store";

function conversation(id: string, title: string, createdAt: number, content: string): ChatConversation {
  return {
    id,
    title,
    createdAt,
    updatedAt: createdAt,
    model: "gpt-test",
    provider: "openai",
    messages: [{ id: `${id}-message`, role: "user", content }],
  };
}

function renderHistory() {
  return render(<MemoryRouter><HistoryPage /></MemoryRouter>);
}

beforeEach(() => {
  const now = Date.now();
  useAppStore.setState({
    conversations: [
      conversation("today", "Project notes", now, "Release checklist"),
      conversation("yesterday", "Weekend plans", now - 86_400_000, "Museum visit"),
    ],
    activeConversationId: "today",
  });
});

afterEach(cleanup);

describe("history page", () => {
  it("searches titles and message content while grouping results by day", async () => {
    const user = userEvent.setup();
    renderHistory();

    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Yesterday")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Search history" }), "museum");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByText("Weekend plans")).toBeTruthy();
    expect(screen.queryByText("Project notes")).toBeNull();
    expect(screen.getByText("Yesterday")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("confirms deletion and traps focus until Escape or an action closes the dialog", async () => {
    const user = userEvent.setup();
    renderHistory();
    const deleteButton = screen.getByRole("button", { name: "Delete Project notes" });
    await user.click(deleteButton);
    const dialog = screen.getByRole("dialog");
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });
    const confirmButton = within(dialog).getByRole("button", { name: "Delete" });

    expect(within(dialog).getByRole("heading", { name: "Delete “Project notes”?" })).toBeTruthy();
    expect(document.activeElement).toBe(cancelButton);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(confirmButton);
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(cancelButton);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(deleteButton);

    await user.click(deleteButton);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(screen.queryByText("Project notes")).toBeNull();
    expect(useAppStore.getState().activeConversationId).toBeNull();
  });

  it("exports the selected history conversation as an importable JSON file", async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    const previousCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:conversation";
      }),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    try {
      renderHistory();
      await user.click(screen.getByRole("button", { name: "Export Project notes as JSON" }));

      expect(downloads).toEqual(["Project notes.json"]);
      expect(blobs).toHaveLength(1);
      expect(blobs[0]?.type).toBe("application/json");
      const reader = new FileReader();
      const contents = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
      });
      reader.readAsText(blobs[0]!);
      expect(JSON.parse(await contents)).toMatchObject({
        id: "today",
        title: "Project notes",
        messages: [{ content: "Release checklist" }],
      });
    } finally {
      click.mockRestore();
      if (previousCreateObjectURL) {
        Object.defineProperty(URL, "createObjectURL", previousCreateObjectURL);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
    }
  });
});
