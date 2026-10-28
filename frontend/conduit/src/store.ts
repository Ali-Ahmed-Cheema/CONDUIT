import { create } from "zustand";
import type { Connection, ProviderId } from "./types";

export type ThemeMode = "light" | "dark" | "system";
export type ApiStatus = "not-validated" | "working" | "invalid" | "permission-denied" | "rate-limited" | "network-error" | "validation-failed";

export interface ApiKeyRecord {
  id: string;
  provider: ProviderId | "unknown";
  masked: string;
  key: string;
  status: ApiStatus;
  models: string[];
  active: boolean;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  ts?: number;
  model?: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  connectionId?: string | null;
  provider?: ProviderId | "unknown";
  model: string;
  keyId?: string | null;
  messages: ChatMessage[];
}

interface AppState {
  unlocked: boolean;
  theme: ThemeMode;
  soundOn: boolean;
  autoLockMinutes: number;
  keys: ApiKeyRecord[];
  connections: Connection[];
  activeConnectionId: string | null;
  conversations: ChatConversation[];
  activeConversationId: string | null;
  activeKeyId: string | null;
  activeModel: string;
  lastInteraction: number;
  vaultError: string | null;
  dataKey: Awaited<ReturnType<typeof crypto.subtle.importKey>> | null;
  setUnlocked: (value: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  setSoundOn: (value: boolean) => void;
  setAutoLockMinutes: (minutes: number) => void;
  setDataKey: (key: Awaited<ReturnType<typeof crypto.subtle.importKey>> | null) => void;
  setKeys: (keys: ApiKeyRecord[]) => void;
  setConnections: (connections: Connection[]) => void;
  setActiveConnectionId: (id: string | null) => void;
  setActiveKeyId: (id: string | null) => void;
  setActiveModel: (value: string) => void;
  setConversations: (conversations: ChatConversation[]) => void;
  setActiveConversationId: (id: string | null) => void;
  addConversation: (conversation: ChatConversation) => void;
  updateConversation: (id: string, updater: (conversation: ChatConversation) => ChatConversation) => void;
  appendMessage: (conversationId: string, message: ChatMessage) => void;
  setLastInteraction: (value: number) => void;
  setVaultError: (value: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  unlocked: false,
  theme: "light",
  soundOn: true,
  autoLockMinutes: 5,
  keys: [],
  connections: [],
  activeConnectionId: null,
  conversations: [],
  activeConversationId: null,
  activeKeyId: null,
  activeModel: "",
  lastInteraction: Date.now(),
  vaultError: null,
  dataKey: null,
  setUnlocked: (value) => set({ unlocked: value }),
  setTheme: (theme) => set({ theme }),
  setSoundOn: (value) => set({ soundOn: value }),
  setAutoLockMinutes: (minutes) => set({ autoLockMinutes: minutes }),
  setDataKey: (key) => set({ dataKey: key }),
  setKeys: (keys) => set({ keys }),
  setConnections: (connections) => set({ connections }),
  setActiveConnectionId: (id) => set({ activeConnectionId: id }),
  setActiveKeyId: (id) => set({ activeKeyId: id }),
  setActiveModel: (value) => set({ activeModel: value }),
  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations.filter((item) => item.id !== conversation.id)],
      activeConversationId: conversation.id,
    })),
  updateConversation: (id, updater) =>
    set((state) => ({
      conversations: state.conversations.map((conversation) => (conversation.id === id ? updater(conversation) : conversation)),
    })),
  appendMessage: (conversationId, message) =>
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const nextMessages = [...conversation.messages, message];
        return {
          ...conversation,
          updatedAt: message.ts ?? Date.now(),
          messages: nextMessages,
        };
      }),
    })),
  setLastInteraction: (value) => set({ lastInteraction: value }),
  setVaultError: (value) => set({ vaultError: value }),
}));

export const getActiveKey = () => {
  const { keys, activeKeyId } = useAppStore.getState();
  return keys.find((key) => key.id === activeKeyId) ?? null;
};

export const getCurrentConversation = () => {
  const { conversations, activeConversationId } = useAppStore.getState();
  return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
};

interface LegacyChatState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  currentConnectionId: string | null;
  currentModel: string;
  startNewConversation: (connectionId: string | null, model: string) => string;
  activateConversation: (id: string) => void;
  setCurrentContext: (connectionId: string | null, model: string) => void;
  setConversationMessages: (id: string, messages: ChatMessage[]) => void;
  setMessages: (messages: ChatMessage[]) => void;
}

function createConversation(connectionId: string | null, model: string): ChatConversation {
  const now = Date.now();
  return {
    id: globalThis.crypto.randomUUID(),
    title: "New conversation",
    messages: [],
    connectionId,
    model,
    createdAt: now,
    updatedAt: now,
  };
}

export const useChatStore = create<LegacyChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  currentConnectionId: null,
  currentModel: "",
  startNewConversation: (connectionId, model) => {
    const conversation = createConversation(connectionId, model);
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
      currentConnectionId: connectionId,
      currentModel: model,
    }));
    return conversation.id;
  },
  activateConversation: (id) => {
    const conversation = get().conversations.find((item) => item.id === id);
    if (!conversation) return;
    set({
      activeConversationId: id,
      currentConnectionId: conversation.connectionId ?? null,
      currentModel: conversation.model,
    });
  },
  setCurrentContext: (connectionId, model) => set((state) => ({
    currentConnectionId: connectionId,
    currentModel: model,
    conversations: state.conversations.map((conversation) =>
      conversation.id === state.activeConversationId
        ? { ...conversation, connectionId, model, updatedAt: Date.now() }
        : conversation,
    ),
  })),
  setConversationMessages: (id, messages) => set((state) => {
    const current = state.conversations.find((item) => item.id === id);
    if (!current) return state;
    const firstUserMessage = messages.find((message) => message.role === "user")?.content?.trim();
    const title = current.title === "New conversation" && firstUserMessage ? firstUserMessage.slice(0, 72) : current.title;
    return {
      ...state,
      conversations: state.conversations.map((item) => item.id === id ? { ...item, title, messages, updatedAt: Date.now() } : item),
    };
  }),
  setMessages: (messages) => set((state) => {
    const current = state.conversations.find((item) => item.id === state.activeConversationId);
    if (!current) return state;
    return {
      ...state,
      conversations: state.conversations.map((item) =>
        item.id === current.id ? { ...item, messages, updatedAt: Date.now() } : item,
      ),
    };
  }),
}));
