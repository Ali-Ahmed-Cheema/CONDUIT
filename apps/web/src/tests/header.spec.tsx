// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Header } from "../components/Header";

function CurrentPath() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}

afterEach(cleanup);

describe("workspace header", () => {
  it("shows a back button that returns to the chat when there is no app history", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Header title="Settings" showBack />
        <CurrentPath />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("status").textContent).toBe("/");
  });

  it("offers a getting started guide in the More menu", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header title="Chat" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /More/ }));

    expect(screen.getByRole("link", { name: "Getting started" })).toBeTruthy();
  });
});
