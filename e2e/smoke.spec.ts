import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("sets comfort preferences, streams a reply, and navigates accessibly", async ({ page }) => {
  const screenshotDir = resolve("docs", "screenshots");
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
  await expect(page.getByText("No active connection is configured")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("heading", { name: "Make it comfortable" })).toHaveCount(0);
  if (process.env.UPDATE_DESIGN_SCREENSHOTS === "1") {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: resolve(screenshotDir, "chat.png"), fullPage: true });
  }

  await page.getByRole("link", { name: "New chat" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "History" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Connect AI" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your AI key").fill("sk-mock-provider-key");
  await page.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByRole("status")).toContainText("Mock OpenAI connection validated and saved.");
  const connectAccessibility = await new AxeBuilder({ page }).analyze();
  expect(connectAccessibility.violations).toEqual([]);

  await page.getByRole("link", { name: "New chat" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Message" }).fill("Say hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Mocked streamed reply")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  if (process.env.UPDATE_DESIGN_SCREENSHOTS === "1") {
    await page.screenshot({ path: resolve(screenshotDir, "chat.png"), fullPage: true });
  }

  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeInViewport();
  await page.setViewportSize({ width: 360, height: 430 });
  await expect(composer).toBeInViewport();

  await page.getByRole("link", { name: "Settings" }).click();
  const simpleMode = page.getByRole("switch", { name: "Simple Mode" });
  await expect(simpleMode).toHaveAttribute("aria-checked", "true");
  await simpleMode.click();
  await expect(simpleMode).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: "Reduce transparency" }).click();
  await page.getByRole("switch", { name: "Reduce motion" }).click();
  await page.getByRole("switch", { name: "High contrast" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-transparency", "true");
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "true");
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("button", { name: "Extra Large", exact: true }).click();
  expect(await page.locator(".settings-page").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Clear all data" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Clear all data" })).toBeInViewport();
  const settingsAccessibility = await new AxeBuilder({ page }).analyze();
  expect(settingsAccessibility.violations).toEqual([]);
  if (process.env.UPDATE_DESIGN_SCREENSHOTS === "1") {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("main").evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: resolve("docs", "screenshots", "settings.png"), fullPage: true });
  }

  await page.getByRole("link", { name: "New chat" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  const darkAccessibility = await new AxeBuilder({ page }).analyze();
  expect(darkAccessibility.violations).toEqual([]);

  for (const [width, height] of [[360, 430], [768, 800], [1280, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("textbox", { name: "Message" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("button", { name: /^Say hello \d/ })).toBeVisible();
  const historyAccessibility = await new AxeBuilder({ page }).analyze();
  expect(historyAccessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: "About" }).click();
  await page.getByRole("button", { name: "Technical details" }).click();
  const aboutAccessibility = await new AxeBuilder({ page }).analyze();
  expect(aboutAccessibility.violations).toEqual([]);
});
