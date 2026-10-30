import { describe, expect, it } from "vitest";
import { defaultUiPreferences, readUiPreferences } from "../store";

describe("UI preference defaults and vault migration", () => {
  it("uses safe defaults for older vaults without comfort preferences", () => {
    expect(readUiPreferences(undefined)).toEqual(defaultUiPreferences);
  });

  it("accepts known preferences and ignores invalid saved values", () => {
    expect(readUiPreferences({
      comfortSetupComplete: true,
      simpleMode: false,
      textSize: "extra-large",
      reduceMotion: true,
      reduceTransparency: true,
      highContrast: false,
      unexpected: "ignored",
    })).toEqual({
      comfortSetupComplete: true,
      simpleMode: false,
      textSize: "extra-large",
      reduceMotion: true,
      reduceTransparency: true,
      highContrast: false,
    });

    expect(readUiPreferences({ textSize: "giant", simpleMode: "yes" })).toEqual(defaultUiPreferences);
  });
});
