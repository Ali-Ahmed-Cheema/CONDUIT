import { describe, expect, it } from "vitest";
import { constantTimeEquals } from "../crypto/lockout";
import { groupConversations } from "../lib/group";
import { estimateTokens, makeTokenSummary } from "../lib/tokens";

describe("crypto guardrails", () => {
  it("compares equal strings in constant time", () => {
    expect(constantTimeEquals("apple001", "apple001")).toBe(true);
    expect(constantTimeEquals("apple001", "apple002")).toBe(false);
  });
});

describe("grouping and token helpers", () => {
  it("groups by day label in a single pass", () => {
    const now = Date.now();
    const groups = groupConversations([
      { id: "a", createdAt: now, title: "Today", provider: "google", model: "gemini-2.5-flash" },
      { id: "b", createdAt: now - 86400000, title: "Yesterday", provider: "openai", model: "gpt-4o-mini" },
    ]);

    expect(groups.has("Today")).toBe(true);
    expect(groups.has("Yesterday")).toBe(true);
  });

  it("estimates tokens and formats reports without mixing estimates", () => {
    expect(estimateTokens("hello world")).toBe(3);
    expect(makeTokenSummary({ input: 12, output: 8 }, 5)).toContain("Reported: 12 in - 8 out");
    expect(makeTokenSummary({ input: 12, output: 8 }, 5)).toContain("Estimated (not exact): ~5");
  });
});
