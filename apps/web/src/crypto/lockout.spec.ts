import { afterEach, describe, expect, it, vi } from "vitest";

import { createVaultCredentials, deriveDataKey, verifyPassword } from "./lockout";
import { encryptVaultValue, decryptVaultValue } from "@conduit/crypto";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("in-app password setup", () => {
  it("generates random salts, verifies the password, and derives an AES-GCM key", async () => {
    class WebCryptoWorker {
      onmessage: ((event: MessageEvent<{ hex: string }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;

      postMessage({ password, salt }: { password: string; salt: string }) {
        void (async () => {
          try {
            const passwordKey = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(password),
              "PBKDF2",
              false,
              ["deriveBits"],
            );
            const bits = await crypto.subtle.deriveBits({
              name: "PBKDF2",
              hash: "SHA-256",
              iterations: 210_000,
              salt: new Uint8Array(salt.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []),
            }, passwordKey, 256);
            const hex = Array.from(new Uint8Array(bits))
              .map((value) => value.toString(16).padStart(2, "0"))
              .join("");
            this.onmessage?.({ data: { hex } } as MessageEvent<{ hex: string }>);
          } catch (error) {
            this.onerror?.({ error } as ErrorEvent);
          }
        })();
      }

      terminate() {}
    }

    vi.stubGlobal("Worker", WebCryptoWorker);
    const first = await createVaultCredentials("long-test-password!");
    const second = await createVaultCredentials("long-test-password!");

    expect(first.setup.saltVerify).not.toBe(second.setup.saltVerify);
    expect(first.setup.saltData).not.toBe(second.setup.saltData);
    expect(first.setup.verifier).not.toContain("long-test-password!");
    await expect(verifyPassword("long-test-password!", first.setup)).resolves.toBe(true);
    await expect(verifyPassword("different-password", first.setup)).resolves.toBe(false);

    const encrypted = await encryptVaultValue(first.dataKey, { chats: ["saved"] });
    await expect(decryptVaultValue(first.dataKey, encrypted)).resolves.toEqual({ chats: ["saved"] });
    await expect(deriveDataKey("long-test-password!", first.setup.saltData)).resolves.toBeInstanceOf(CryptoKey);
  });
});
