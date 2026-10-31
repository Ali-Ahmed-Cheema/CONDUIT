// @vitest-environment jsdom

import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PromptLibrary } from "../components/PromptLibrary";
import { promptTemplates } from "../lib/promptLibrary";

afterEach(cleanup);

describe("prompt library", () => {
  it("provides exactly 50 categorized prompt starters", () => {
    expect(promptTemplates).toHaveLength(50);
    expect(new Set(promptTemplates.map((template) => template.id)).size).toBe(50);
    expect(new Set(promptTemplates.map((template) => template.category)).size).toBe(10);
  });

  it("filters prompts by category and search text", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PromptLibrary /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Prompt library" }));
    expect(screen.getByText("50 prompts")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Coding" }));
    expect(screen.getByText("5 prompts")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Explain some code" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Polish a draft" })).toBeNull();

    await user.type(screen.getByRole("searchbox", { name: "Search prompts" }), "debug");
    expect(screen.getByText("1 prompt")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Debug an error" })).toBeTruthy();
  });

  it("copies a prompt and reports clipboard failures", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MemoryRouter><PromptLibrary /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Prompt library" }));
    await user.click(screen.getByRole("button", { name: "Copy prompt: Polish a draft" }));

    expect(writeText).toHaveBeenCalledWith(promptTemplates[0]?.prompt);
    expect((await screen.findByRole("status")).textContent).toContain("Prompt copied.");

    writeText.mockRejectedValueOnce(new Error("Permission denied"));
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt: Write a first draft" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Permission denied"));
  });
});
