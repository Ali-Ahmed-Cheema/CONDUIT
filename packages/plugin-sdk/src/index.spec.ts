import { describe, expect, it } from "vitest";
import { PluginManifestSchema } from "./index";

describe("plugin manifest boundary contract", () => {
  it("accepts a versioned manifest with explicit capabilities and permissions", () => {
    expect(PluginManifestSchema.safeParse({
      id: "local.notes",
      version: "1.2.0",
      apiVersion: "1",
      capabilities: ["ui-panel"],
      permissions: ["storage"],
    }).success).toBe(true);
  });

  it("rejects malformed identifiers and undeclared permissions", () => {
    expect(PluginManifestSchema.safeParse({
      id: "../notes",
      version: "latest",
      apiVersion: "1",
      capabilities: ["tool"],
      permissions: ["network"],
    }).success).toBe(false);
    expect(PluginManifestSchema.safeParse({
      id: "local.notes",
      version: "1.0.0",
      apiVersion: "1",
      capabilities: ["tool"],
      permissions: ["admin"],
    }).success).toBe(false);
  });
});
