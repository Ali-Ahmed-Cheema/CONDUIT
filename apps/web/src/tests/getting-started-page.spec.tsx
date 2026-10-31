// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { GettingStartedPage } from "../pages/GettingStarted";

afterEach(cleanup);

describe("getting started page", () => {
  it("guides new users to the main workspace features", () => {
    render(
      <MemoryRouter>
        <GettingStartedPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Welcome to CONDUIT" })).toBeTruthy();
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("link", { name: "Connect AI" }).getAttribute("href")).toBe("/api-config");
    expect(main.getByRole("link", { name: "Start a new chat" }).getAttribute("href")).toBe("/");
    expect(main.getByRole("link", { name: "Open chat history" }).getAttribute("href")).toBe("/history");
    expect(main.getByRole("link", { name: "Personalize settings" }).getAttribute("href")).toBe("/settings");
  });
});
