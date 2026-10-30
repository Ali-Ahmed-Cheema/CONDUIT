import { z } from "zod";

export const AgentBudgetSchema = z.object({
  maxSteps: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  maxCostUsd: z.number().finite().nonnegative(),
});

export const AgentStepSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
});

export const AgentTraceEntrySchema = z.object({
  stepId: z.string().min(1),
  kind: z.enum(["plan", "tool-call", "observation", "approval", "error"]),
  timestamp: z.number().finite(),
  summary: z.string(),
});

export type AgentBudget = z.infer<typeof AgentBudgetSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;
export type AgentTraceEntry = z.infer<typeof AgentTraceEntrySchema>;
