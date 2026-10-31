import { z } from "zod";

export const ProviderIdSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "groq",
  "openrouter",
  "huggingface",
  "mistral",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const HealthResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const FeatureFlagEnvironmentSchema = z.object({
  TYPED_API: z.enum(["0", "1"]).default("0"),
  AGENT_RUNTIME: z.enum(["0", "1"]).default("0"),
  LOCAL_MODELS: z.enum(["0", "1"]).default("0"),
  RETRIEVAL: z.enum(["0", "1"]).default("0"),
  PLUGINS: z.enum(["0", "1"]).default("0"),
  ENCRYPTED_SYNC: z.enum(["0", "1"]).default("0"),
});
export const VaultSetupSchema = z.object({
  version: z.literal(1),
  saltVerify: z.string().regex(/^[0-9a-f]{32}$/i),
  verifier: z.string().regex(/^[0-9a-f]{64}$/i),
  saltData: z.string().regex(/^[0-9a-f]{32}$/i),
});
export type VaultSetupContract = z.infer<typeof VaultSetupSchema>;
export const VAULT_BACKUP_FORMAT = "CONDUIT_VAULT_BACKUP";
export const VAULT_BACKUP_VERSION = 1;
export const VAULT_BACKUP_KDF_ITERATIONS = 210_000;
export const VaultBackupSchema = z.object({
  format: z.literal(VAULT_BACKUP_FORMAT),
  version: z.literal(VAULT_BACKUP_VERSION),
  kdf: z.object({
    name: z.literal("PBKDF2-SHA-256"),
    iterations: z.literal(VAULT_BACKUP_KDF_ITERATIONS),
    salt: z.string().regex(/^[0-9a-f]{32}$/i),
  }),
  encrypted: z.object({
    iv: z.string().regex(/^[0-9a-f]{24}$/i),
    ciphertext: z.string().regex(/^(?:[0-9a-f]{2})+$/i),
  }),
});
export type VaultBackupContract = z.infer<typeof VaultBackupSchema>;
export type FeatureFlags = {
  typedApi: boolean;
  agentRuntime: boolean;
  localModels: boolean;
  retrieval: boolean;
  plugins: boolean;
  encryptedSync: boolean;
};

export function resolveFeatureFlags(read: (name: string) => string | undefined): FeatureFlags {
  const parsed = FeatureFlagEnvironmentSchema.parse({
    TYPED_API: read("TYPED_API"),
    AGENT_RUNTIME: read("AGENT_RUNTIME"),
    LOCAL_MODELS: read("LOCAL_MODELS"),
    RETRIEVAL: read("RETRIEVAL"),
    PLUGINS: read("PLUGINS"),
    ENCRYPTED_SYNC: read("ENCRYPTED_SYNC"),
  });
  return {
    typedApi: parsed.TYPED_API === "1",
    agentRuntime: parsed.AGENT_RUNTIME === "1",
    localModels: parsed.LOCAL_MODELS === "1",
    retrieval: parsed.RETRIEVAL === "1",
    plugins: parsed.PLUGINS === "1",
    encryptedSync: parsed.ENCRYPTED_SYNC === "1",
  };
}

export const ConnectionStatusSchema = z.enum(["valid", "invalid", "rate-limited"]);
export const ConnectionSchema = z.object({
  id: z.string(),
  provider: ProviderIdSchema,
  providerName: z.string(),
  environment: z.string().trim().min(1).max(40).optional(),
  keyHint: z.string(),
  models: z.array(z.string()),
  addedAt: z.string(),
  status: ConnectionStatusSchema.optional(),
  lastValidatedAt: z.string().optional(),
}).strict();
export type Connection = z.infer<typeof ConnectionSchema>;

export const ConnectionsResponseSchema = z.object({
  connections: z.array(ConnectionSchema),
  activeId: z.string().nullable(),
}).strict();
export type ConnectionsResponse = z.infer<typeof ConnectionsResponseSchema>;

export const ValidationResultSchema = z.object({
  validationId: z.string(),
  provider: ProviderIdSchema,
  providerName: z.string(),
  models: z.array(z.string()),
  chatModels: z.array(z.string()),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  model: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const MAX_CHAT_HISTORY_CHARACTERS = 180_000;

export const ChatAttachmentSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(0),
  type: z.string().max(128).optional(),
  content: z.string().max(MAX_CHAT_HISTORY_CHARACTERS),
});
export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

const GitHubNameSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/);
const GitHubTokenSchema = z.string().trim().max(512).regex(/^[^\r\n]*$/).optional();

export const GitHubRepositoryConnectRequestSchema = z.object({
  url: z.string().trim().min(1).max(2_000),
  token: GitHubTokenSchema,
}).strict();

export const GitHubRepositorySchema = z.object({
  owner: GitHubNameSchema,
  name: GitHubNameSchema,
  fullName: z.string().min(3).max(201),
  defaultBranch: z.string().min(1).max(255),
}).strict();
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

export const GitHubRepositoryTreeRequestSchema = z.object({
  owner: GitHubNameSchema,
  repo: GitHubNameSchema,
  ref: z.string().min(1).max(255),
  token: GitHubTokenSchema,
}).strict();

export const GitHubRepositoryTreeSchema = z.object({
  files: z.array(z.object({
    path: z.string().min(1).max(1_024),
    sha: z.string().regex(/^[a-f0-9]{40,64}$/i),
    size: z.number().int().min(0),
  }).strict()).max(2_500),
  truncated: z.boolean(),
}).strict();
export type GitHubRepositoryTree = z.infer<typeof GitHubRepositoryTreeSchema>;

export const GitHubRepositoryFileRequestSchema = GitHubRepositoryTreeRequestSchema.extend({
  path: z.string().min(1).max(1_024),
  sha: z.string().regex(/^[a-f0-9]{40,64}$/i),
}).strict();

export const GitHubRepositoryFileSchema = z.object({
  path: z.string().min(1).max(1_024),
  size: z.number().int().min(0).max(180_000),
  content: z.string().max(180_000),
}).strict();
export type GitHubRepositoryFile = z.infer<typeof GitHubRepositoryFileSchema>;

export const TokenUsageSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const ChatAlternativeSchema = z.object({
  providerName: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  content: z.string(),
}).strict();
export type ChatAlternative = z.infer<typeof ChatAlternativeSchema>;

export const WorkspaceChatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  attachments: z.array(ChatAttachmentSchema).optional(),
  alternatives: z.array(ChatAlternativeSchema).max(10).optional(),
  comparisonNotice: z.string().max(4_000).optional(),
  ts: z.number().finite().optional(),
  model: z.string().optional(),
  usage: TokenUsageSchema.optional(),
  incomplete: z.boolean().optional(),
  failed: z.boolean().optional(),
}).passthrough();
export type WorkspaceChatMessage = z.infer<typeof WorkspaceChatMessageSchema>;

export const ChatConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  connectionId: z.string().nullable().optional(),
  provider: z.union([ProviderIdSchema, z.literal("unknown")]).optional(),
  model: z.string(),
  keyId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  messages: z.array(WorkspaceChatMessageSchema),
}).passthrough();
export type ChatConversation = z.infer<typeof ChatConversationSchema>;

export const ApiChatMessageSchema = ChatMessageSchema.extend({
  role: z.enum(["user", "assistant"]),
});

export const ChatGenerationOptionsSchema = z.object({
  systemPrompt: z.string().max(12_000).optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
});
export type ChatGenerationOptions = z.infer<typeof ChatGenerationOptionsSchema>;

export const ChatComparisonRequestSchema = z.object({
  mode: z.enum(["automatic", "custom"]),
  judgeMode: z.enum(["provider", "system"]).optional(),
  candidates: z.array(z.object({
    connectionId: z.string().min(1),
    model: z.string().min(1),
  }).strict()).min(2).max(10),
}).strict().refine(
  (comparison) => new Set(comparison.candidates.map(({ connectionId }) => connectionId)).size
    === comparison.candidates.length,
  { message: "Response connections must be unique.", path: ["candidates"] },
).refine(
  (comparison) => comparison.mode !== "automatic" || comparison.candidates.length === 2,
  { message: "Automatic comparison requires exactly two response connections.", path: ["candidates"] },
);
export type ChatComparisonRequest = z.infer<typeof ChatComparisonRequestSchema>;

export const ChatRequestSchema = ChatGenerationOptionsSchema.extend({
  connectionId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(ApiChatMessageSchema).min(1).max(100),
  comparison: ChatComparisonRequestSchema.optional(),
}).refine(
  (request) => request.messages.reduce((total, message) => total + message.content.length, 0)
    <= MAX_CHAT_HISTORY_CHARACTERS,
  { message: "Conversation history exceeds the supported size.", path: ["messages"] },
).refine(
  (request) => request.comparison?.mode !== "custom"
    || request.comparison.judgeMode === "system"
    || !request.comparison.candidates.some((candidate) => candidate.connectionId === request.connectionId),
  { message: "The judge connection cannot also be a respondent in custom comparison mode.", path: ["comparison", "candidates"] },
);

export const ValidateKeyRequestSchema = z.object({
  apiKey: z.string().max(4096).refine((value) => value.trim().length >= 8),
  probeUnknown: z.boolean().optional(),
  environment: z.literal("Default").default("Default"),
});

export const ValidationIdRequestSchema = z.object({
  validationId: z.string(),
});

export const ActiveConnectionRequestSchema = z.object({
  id: z.string().nullable(),
});

export const ChatStreamEventSchema = z.object({
  delta: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
  status: z.number().optional(),
  done: z.boolean().optional(),
  usage: TokenUsageSchema.optional(),
  alternatives: z.array(ChatAlternativeSchema).max(10).optional(),
  comparisonNotice: z.string().max(4_000).optional(),
});
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

export const EncryptedApiKeySchema = z.object({
  iv: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
});
export const StoredConnectionSchema = ConnectionSchema.extend({
  encryptedKey: EncryptedApiKeySchema,
}).passthrough();
export type StoredConnection = z.infer<typeof StoredConnectionSchema>;
export const ConnectionStoreSchema = z.object({
  connections: z.array(StoredConnectionSchema),
  activeId: z.string().nullable(),
}).passthrough();
export type ConnectionStore = z.infer<typeof ConnectionStoreSchema>;

export const VaultDataSchema = z.object({
  version: z.literal(1),
  keys: z.array(z.unknown()),
  chats: z.array(ChatConversationSchema),
  settings: z.record(z.string(), z.unknown()),
}).passthrough();
export type VaultDataContract = z.infer<typeof VaultDataSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
