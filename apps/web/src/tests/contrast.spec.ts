import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function lastThemeBlock(selector: string): string {
  const blocks = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, "g"))];
  const block = blocks.at(-1)?.[1];
  if (!block) throw new Error(`Missing color tokens for ${selector}.`);
  return block;
}

function token(block: string, name: string): string {
  const value = block.match(new RegExp(`${name}:\\s*(#[\\da-fA-F]{6,8})`))?.[1];
  if (!value) throw new Error(`Missing ${name} color token.`);
  return value.slice(0, 7);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("theme text contrast tokens", () => {
  it("keeps body text at AAA contrast over the solid glass surface in both themes", () => {
    for (const selector of [":root", ":root\\[data-t=dark\\]"]) {
      const block = lastThemeBlock(selector);
      const surface = token(block, "--gl");
      expect(contrast(token(block, "--fg"), surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(token(block, "--mut"), surface)).toBeGreaterThanOrEqual(7);
    }
  });
});
