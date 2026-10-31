import { describe, expect, it } from "vitest";
import {
  ChatAttachmentSchema,
  ChatRequestSchema,
  ConnectionStoreSchema,
  ConnectionsResponseSchema,
  MAX_CHAT_HISTORY_CHARACTERS,
  resolveFeatureFlags,
  ValidateKeyRequestSchema,
  VaultBackupSchema,
  VaultDataSchema,
  WorkspaceChatMessageSchema,
} from "./schemas";

describe("shared boundary schemas", () => {
  it("accepts supported chat requests and rejects invalid generation ranges", () => {
    const request = {
      connectionId: "connection-1",
      model: "model-1",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.7,
    };

    expect(ChatRequestSchema.safeParse(request).success).toBe(true);
    expect(ChatRequestSchema.safeParse({ ...request, temperature: 3 }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({
      ...request,
      messages: [{ role: "system", content: "system messages are not accepted by this endpoint" }],
    }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({
      ...request,
      messages: [{ role: "user", content: "x".repeat(MAX_CHAT_HISTORY_CHARACTERS + 1) }],
    }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({
      ...request,
      comparison: {
        mode: "automatic",
        candidates: [
          { connectionId: "connection-1", model: "model-1" },
          { connectionId: "connection-2", model: "model-2" },
        ],
      },
    }).success).toBe(true);
    expect(ChatRequestSchema.safeParse({
      ...request,
      comparison: {
        mode: "automatic",
        candidates: [
          { connectionId: "connection-1", model: "model-1" },
          { connectionId: "connection-1", model: "model-2" },
        ],
      },
    }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({
      ...request,
      comparison: { candidates: [{ connectionId: "connection-1", model: "model-1" }] },
    }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({
      ...request,
      comparison: {
        mode: "automatic",
        candidates: [
          { connectionId: "connection-1", model: "model-1" },
          { connectionId: "connection-2", model: "model-2" },
          { connectionId: "connection-3", model: "model-3" },
        ],
      },
    }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({
      ...request,
      comparison: {
        mode: "custom",
        candidates: [
          { connectionId: "connection-1", model: "model-1" },
          { connectionId: "connection-2", model: "model-2" },
        ],
      },
    }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({
      ...request,
      comparison: {
        mode: "custom",
        candidates: [
          { connectionId: "connection-2", model: "model-2" },
          { connectionId: "connection-3", model: "model-3" },
        ],
      },
    }).success).toBe(true);
  });

  it("accepts any number of attachments within the chat text limit", () => {
    expect(ChatAttachmentSchema.safeParse({
      name: "notes.txt",
      size: 5,
      type: "text/plain",
      content: "notes",
    }).success).toBe(true);
    const attachments = Array.from({ length: 20 }, (_, index) => ({
      name: `file-${index}.bin`,
      size: 128 * 1024,
      content: "converted to text",
    }));
    expect(ChatAttachmentSchema.safeParse(attachments[0]).success).toBe(true);
    expect(WorkspaceChatMessageSchema.safeParse({
      role: "user",
      content: "",
      attachments,
    }).success).toBe(true);
    expect(WorkspaceChatMessageSchema.safeParse({
      role: "user",
      content: "",
      attachments: [{
        name: "large.txt",
        size: 1,
        content: "x".repeat(MAX_CHAT_HISTORY_CHARACTERS + 1),
      }],
    }).success).toBe(false);
  });

  it("rejects malformed or secret-bearing public connection responses", () => {
    const connection = {
      id: "connection-1",
      provider: "openai",
      providerName: "OpenAI",
      keyHint: "************1234",
      models: ["model-1"],
      addedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(ConnectionsResponseSchema.safeParse({
      connections: [connection],
      activeId: "connection-1",
    }).success).toBe(true);
    expect(ConnectionsResponseSchema.safeParse({
      connections: [{ ...connection, encryptedKey: { iv: "", tag: "", ciphertext: "" } }],
      activeId: "connection-1",
    }).success).toBe(false);
  });

  it("validates persisted encrypted connection records", () => {
    const record = {
      id: "connection-1",
      provider: "openai",
      providerName: "OpenAI",
      keyHint: "************1234",
      models: ["model-1"],
      addedAt: "2026-01-01T00:00:00.000Z",
      encryptedKey: { iv: "iv", tag: "tag", ciphertext: "encrypted" },
    };

    expect(ConnectionStoreSchema.safeParse({ connections: [record], activeId: record.id }).success).toBe(true);
    expect(ConnectionStoreSchema.safeParse({ connections: [record], activeId: "missing" }).success).toBe(true);
    expect(ValidateKeyRequestSchema.safeParse({ apiKey: "short" }).success).toBe(false);
    expect(ValidateKeyRequestSchema.parse({ apiKey: "long-enough-key" }).environment).toBe("Default");
    expect(ValidateKeyRequestSchema.safeParse({
      apiKey: "long-enough-key",
      environment: "Staging",
    }).success).toBe(false);
  });

  it("keeps optional features disabled unless explicitly enabled", () => {
    const disabled = resolveFeatureFlags(() => undefined);
    expect(Object.values(disabled).every((enabled) => !enabled)).toBe(true);
    expect(resolveFeatureFlags((name) => name === "TYPED_API" ? "1" : undefined).typedApi).toBe(true);
    expect(() => resolveFeatureFlags(() => "enabled")).toThrow();
  });

  it("preserves forward-compatible fields when validating V3 vault payloads", () => {
    const vault = VaultDataSchema.parse({
      version: 1,
      keys: [],
      chats: [{
        id: "chat-1",
        title: "Conversation",
        createdAt: 1,
        updatedAt: 2,
        model: "model-1",
        messages: [{ role: "user", content: "Hello", futureMessageField: "preserve" }],
        futureConversationField: "preserve",
      }],
      settings: {},
      futureVaultField: "preserve",
    });

    expect(vault.futureVaultField).toBe("preserve");
    expect(vault.chats[0]?.futureConversationField).toBe("preserve");
    expect(vault.chats[0]?.messages[0]?.futureMessageField).toBe("preserve");
  });

  it("validates the encrypted backup envelope and fixed KDF parameters", () => {
    const backup = {
      format: "CONDUIT_VAULT_BACKUP",
      version: 1,
      kdf: {
        name: "PBKDF2-SHA-256",
        iterations: 210_000,
        salt: "00".repeat(16),
      },
      encrypted: {
        iv: "00".repeat(12),
        ciphertext: "00",
      },
    };

    expect(VaultBackupSchema.safeParse(backup).success).toBe(true);
    expect(VaultBackupSchema.safeParse({
      ...backup,
      kdf: { ...backup.kdf, iterations: 1 },
    }).success).toBe(false);
  });
});
