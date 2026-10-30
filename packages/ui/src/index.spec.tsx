// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmptyState,
  GlassButton,
  GlassCard,
  GlassDialog,
  GlassInput,
  GlassPanel,
  GlassTabBar,
  GlassToggle,
  Toast,
} from "./index";

afterEach(cleanup);

describe("shared glass UI", () => {
  it("renders labeled inputs and associated help text", () => {
    render(<GlassInput label="Your name" hint="Use the name you prefer." />);

    const input = screen.getByRole("textbox", { name: "Your name" });
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Use the name you prefer.")).toBeTruthy();
  });

  it("exposes the toggle state and changes it when activated", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GlassToggle label="Simple mode" checked={false} onChange={onChange} />);

    const toggle = screen.getByRole("switch", { name: "Simple mode" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("provides an accessible dialog that closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <GlassDialog open title="Confirm" onClose={onClose}>
        <button>Cancel</button>
        <button>Continue</button>
      </GlassDialog>,
    );

    expect(screen.getByRole("dialog", { name: "Confirm" }).getAttribute("aria-modal")).toBe("true");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(document.activeElement).toBe(cancel);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(continueButton);
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(cancel);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("marks the current navigation tab", () => {
    render(
      <MemoryRouter>
        <GlassTabBar tabs={[
          { href: "/", label: "Chat", icon: <span aria-hidden="true">C</span>, current: true },
          { href: "/history", label: "History", icon: <span aria-hidden="true">H</span> },
        ]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Chat" }).getAttribute("aria-current")).toBe("page");
  });

  it("renders panel, card, action, toast, and an actionable empty state", () => {
    const onDismiss = vi.fn();
    render(
      <>
        <GlassPanel>Panel</GlassPanel>
        <GlassCard>Card</GlassCard>
        <GlassButton variant="primary">Continue</GlassButton>
        <Toast message="Saved" onDismiss={onDismiss} duration={0} />
        <EmptyState title="No chats" description="Start a chat to see it here." action={<button>New chat</button>} />
      </>,
    );

    expect(screen.getByText("Panel")).toBeTruthy();
    expect(screen.getByText("Card")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Saved");
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
  });
});
