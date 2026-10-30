import { afterEach, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, getConnectionStorePath, validateEncryptionKey } from "../server/keyStore";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const originalEncryptionKey = process.env.CONDUIT_ENCRYPTION_KEY;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.CONDUIT_ENCRYPTION_KEY;
  else process.env.CONDUIT_ENCRYPTION_KEY = originalEncryptionKey;
});

describe("encrypted key storage", () => {
  it("keeps the V3 connection-file location across the app move", () => {
    expect(getConnectionStorePath()).toBe(
      resolve(repositoryRoot, "frontend", "conduit", "data", "connections.json"),
    );
    expect(getConnectionStorePath("C:\\conduit")).toBe(
      resolve("C:\\conduit", "frontend", "conduit", "data", "connections.json"),
    );
    expect(getConnectionStorePath("C:\\conduit", "D:\\conduit-data")).toBe(
      resolve("D:\\conduit-data", "connections.json"),
    );
  });

  it("accepts exactly 32 canonical base64-decoded bytes", () => {
    process.env.CONDUIT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(() => validateEncryptionKey()).not.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["wrong length", Buffer.alloc(31, 7).toString("base64")],
    ["malformed base64", `${Buffer.alloc(32, 7).toString("base64")}!`],
  ])("rejects a %s encryption key with a clear error", (_description, key) => {
    if (key === undefined) delete process.env.CONDUIT_ENCRYPTION_KEY;
    else process.env.CONDUIT_ENCRYPTION_KEY = key;

    expect(() => validateEncryptionKey()).toThrow("CONDUIT_ENCRYPTION_KEY");
  });

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
