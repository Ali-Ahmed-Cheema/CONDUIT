import { describe, expect, it } from "vitest";
import { AgentBudgetSchema, AgentStepSchema, AgentTraceEntrySchema } from "./index";

describe("agent boundary contracts", () => {
  it("requires finite budgets and valid step limits", () => {
    expect(AgentBudgetSchema.safeParse({ maxSteps: 8, maxTokens: 2000, maxCostUsd: 1.5 }).success).toBe(true);
    expect(AgentBudgetSchema.safeParse({ maxSteps: 0, maxTokens: 2000, maxCostUsd: 1.5 }).success).toBe(false);
    expect(AgentBudgetSchema.safeParse({ maxSteps: 8, maxTokens: 2000, maxCostUsd: Infinity }).success).toBe(false);
  });

  it("validates persisted step and trace shapes", () => {
    expect(AgentStepSchema.safeParse({ id: "step-1", goal: "Summarize", status: "pending" }).success).toBe(true);
    expect(AgentTraceEntrySchema.safeParse({
      stepId: "step-1",
      kind: "approval",
      timestamp: 100,
      summary: "Approval required",
    }).success).toBe(true);
  });
});
