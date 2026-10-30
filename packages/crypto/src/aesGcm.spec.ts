import { describe, expect, it } from "vitest";
import { decryptVaultValue, encryptVaultValue } from "./aesGcm";

async function createKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

describe("AES-GCM vault encryption", () => {
  it("round-trips JSON using a fresh initialization vector", async () => {
    const key = await createKey();
    const value = { chats: [{ id: "local-chat", content: "private" }] };
    const first = await encryptVaultValue(key, value);
    const second = await encryptVaultValue(key, value);

    expect(first.iv).toHaveLength(24);
    expect(first.iv).not.toBe(second.iv);
    expect(await decryptVaultValue(key, first)).toEqual(value);
  });

  it("rejects modified ciphertext and malformed hexadecimal input", async () => {
    const key = await createKey();
    const encrypted = await encryptVaultValue(key, { content: "private" });
    const finalDigit = encrypted.ciphertext.endsWith("0") ? "1" : "0";
    const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -1)}${finalDigit}` };

    await expect(decryptVaultValue(key, tampered)).rejects.toThrow();
    await expect(decryptVaultValue(key, { ...encrypted, iv: "not-hex" }))
      .rejects.toThrow("invalid hexadecimal data");
  });
});
