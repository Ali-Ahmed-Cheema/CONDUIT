import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("sets up, streams a reply, locks, and restores chat history", async ({ page }) => {
  const savedConnection = {
    id: "mock-connection",
    provider: "openai",
    providerName: "Mock OpenAI",
    keyHint: "********1234",
    models: ["gpt-mock"],
    addedAt: "2026-01-01T00:00:00.000Z",
    status: "valid",
    lastValidatedAt: "2026-01-01T00:00:00.000Z",
  };
  let connectionSaved = false;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/connections" && request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          connections: connectionSaved ? [savedConnection] : [],
          activeId: connectionSaved ? savedConnection.id : null,
        }),
      });
      return;
    }
    if (pathname === "/api/validate" && request.method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          validationId: "mock-validation",
          provider: "openai",
          providerName: "Mock OpenAI",
          models: ["gpt-mock"],
          chatModels: ["gpt-mock"],
        }),
      });
      return;
    }
    if (pathname === "/api/connections" && request.method() === "POST") {
      connectionSaved = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ connections: [savedConnection], activeId: savedConnection.id }),
      });
      return;
    }
    if (pathname === "/api/chat/stream" && request.method() === "POST") {
      await route.fulfill({
        contentType: "text/event-stream",
        body: [
          `data: ${JSON.stringify({ delta: "Mocked streamed reply" })}`,
          `data: ${JSON.stringify({ model: "gpt-mock" })}`,
          `data: ${JSON.stringify({ usage: { input: 5, output: 4 } })}`,
          `data: ${JSON.stringify({ done: true })}`,
          "",
        ].join("\n\n"),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("New password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm new password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByText(/No active connection is configured/)).toBeVisible();

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("link", { name: "API Config", exact: true }).click();
  await page.getByLabel("API key").fill("sk-mock-provider-key");
  await page.getByRole("button", { name: "Validate & add" }).click();
  await expect(page.getByRole("status")).toContainText("Mock OpenAI connection validated and saved.");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("textbox", { name: "Message" }).fill("Say hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Mocked streamed reply")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeInViewport();
  await page.setViewportSize({ width: 360, height: 430 });
  await expect(composer).toBeInViewport();

  await page.getByRole("button", { name: "Lock now" }).click();
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Mocked streamed reply")).toBeVisible();

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /Say hello/ })).toBeVisible();
});
