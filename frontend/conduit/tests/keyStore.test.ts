import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey } from "../server/keyStore";

describe("encrypted key storage", () => {
  it("encrypts and decrypts API keys with AES-GCM", () => {
    process.env.CONDUIT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const secret = "sk-private-test-key";
    const encrypted = encryptApiKey(secret);

    expect(JSON.stringify(encrypted)).not.toContain(secret);
    expect(decryptApiKey(encrypted)).toBe(secret);
  });

  it("rejects tampered ciphertext", () => {
    process.env.CONDUIT_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const encrypted = encryptApiKey("private-key-value");
    expect(() => decryptApiKey({ ...encrypted, ciphertext: Buffer.from("tampered").toString("base64") })).toThrow();
  });
});
