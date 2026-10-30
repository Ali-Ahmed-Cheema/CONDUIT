import { describe, expect, it } from "vitest";
import { types } from "../packages/credential-reference/src/credentialTypes";

describe("credential type catalog", () => {
  it("provides unique, complete inputs for every listed credential type", () => {
    expect(types).toHaveLength(16);
    expect(new Set(types.map((type) => type.id)).size).toBe(types.length);

    for (const type of types) {
      expect(type.name).not.toBe("");
      expect(type.purpose).not.toBe("");
      expect(type.result).not.toBe("");
      expect(type.fields.length).toBeGreaterThan(0);
      expect(type.fields.every((field) => field.label.length > 0)).toBe(true);
    }
  });

  it("covers the visibility, permission, environment, token, and machine groups", () => {
    expect(new Set(types.map((type) => type.group))).toEqual(
      new Set(["Visibility", "Permission", "Environment", "Token", "Machine"]),
    );
  });

  it("provides separate identity and secret fields for key pairs", () => {
    const keyPair = types.find((type) => type.id === "pair");

    expect(keyPair?.fields.map((field) => field.id)).toEqual(["id", "secret"]);
    expect(keyPair?.fields.find((field) => field.id === "secret")?.secret).toBe(
      true,
    );
  });

  it("includes scope and optional expiration inputs where they apply", () => {
    for (const id of ["restricted", "access", "pat"]) {
      const type = types.find((entry) => entry.id === id);
      expect(type?.fields.some((field) => field.id === "scopes")).toBe(true);
    }

    for (const id of ["access", "refresh", "jwt", "pat", "temporary"]) {
      const expiry = types.find((entry) => entry.id === id)?.fields.find(
        (field) => field.id === "expiry",
      );
      expect(expiry?.optional, id).toBe(true);
    }
  });
});
