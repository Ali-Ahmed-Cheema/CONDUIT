import { describe, expect, it } from "vitest";
import {
  credentialCategories,
  credentialRestrictions,
  credentialTypes,
} from "./credentials";

describe("credential catalog", () => {
  it("includes each credential type from the reference", () => {
    expect(credentialTypes.map(({ id }) => id)).toEqual([
      "public",
      "secret",
      "restricted",
      "read-only",
      "read-write",
      "admin",
      "test",
      "live",
      "access-token",
      "refresh-token",
      "jwt",
      "pat",
      "temporary",
      "key-pair",
      "service-account",
      "webhook",
    ]);
  });

  it("gives every credential type at least one named input", () => {
    for (const credential of credentialTypes) {
      expect(credential.fields.length, credential.name).toBeGreaterThan(0);
      expect(new Set(credential.fields.map(({ id }) => id)).size, credential.name).toBe(
        credential.fields.length,
      );
      for (const field of credential.fields) {
        expect(field.label, credential.name).toBeTruthy();
        expect(field.type, credential.name).toMatch(/^(secret|text|textarea|date|number)$/);
      }
    }
  });

  it("covers all credential categories and optional restriction types", () => {
    expect(new Set(credentialTypes.map(({ category }) => category))).toEqual(
      new Set(credentialCategories),
    );
    expect(credentialRestrictions.map(({ id }) => id)).toEqual([
      "ip",
      "domain",
      "app",
      "quota",
    ]);
  });

  it("uses separate inputs for temporary and paired machine credentials", () => {
    const temporary = credentialTypes.find(({ id }) => id === "temporary");
    const pair = credentialTypes.find(({ id }) => id === "key-pair");
    const accessToken = credentialTypes.find(({ id }) => id === "access-token");

    expect(temporary?.fields.map(({ id }) => id)).toEqual([
      "accessKeyId",
      "secretAccessKey",
      "sessionToken",
      "expiresAt",
    ]);
    expect(pair?.fields.map(({ id }) => id)).toEqual(["keyId", "keySecret"]);
    expect(accessToken?.fields.find(({ id }) => id === "expiresAt")?.required).toBe(false);
  });
});
