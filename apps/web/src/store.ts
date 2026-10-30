import { create } from "zustand";
import type { ChatConversation as ChatConversationContract, WorkspaceChatMessage } from "@conduit/core";
import type { Connection, ProviderId } from "./types";

export type ThemeMode = "light" | "dark" | "system";
export type TextSize = "normal" | "large" | "extra-large";
export type ApiStatus = "not-validated" | "working" | "invalid" | "permission-denied" | "rate-limited" | "network-error" | "validation-failed";

export interface UiPreferences {
  comfortSetupComplete: boolean;
  simpleMode: boolean;
  textSize: TextSize;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  highContrast: boolean;
}

export const defaultUiPreferences: UiPreferences = {
  comfortSetupComplete: false,
  simpleMode: true,
  textSize: "normal",
  reduceMotion: false,
  reduceTransparency: false,
  highContrast: false,
};

export function readUiPreferences(value: unknown): UiPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultUiPreferences;
  const stored = value as Record<string, unknown>;
  return {
    comfortSetupComplete: stored.comfortSetupComplete === true,
    simpleMode: typeof stored.simpleMode === "boolean" ? stored.simpleMode : defaultUiPreferences.simpleMode,
    textSize: stored.textSize === "large" || stored.textSize === "extra-large"
      ? stored.textSize
      : defaultUiPreferences.textSize,
    reduceMotion: typeof stored.reduceMotion === "boolean" ? stored.reduceMotion : defaultUiPreferences.reduceMotion,
    reduceTransparency: typeof stored.reduceTransparency === "boolean"
      ? stored.reduceTransparency
      : defaultUiPreferences.reduceTransparency,
    highContrast: typeof stored.highContrast === "boolean" ? stored.highContrast : defaultUiPreferences.highContrast,
  };
}

export interface ApiKeyRecord {
  id: string;
  provider: ProviderId | "unknown";
  masked: string;
  key: string;
  status: ApiStatus;
  models: string[];
  active: boolean;
}

export type ChatMessage = WorkspaceChatMessage;
export type ChatConversation = ChatConversationContract;

interface AppState {
  unlocked: boolean;
  theme: ThemeMode;
  soundOn: boolean;
  autoLockMinutes: number;
  preferences: UiPreferences;
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
  setPreferences: (preferences: Partial<UiPreferences>) => void;
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
  preferences: defaultUiPreferences,
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
  setPreferences: (preferences) => set((state) => ({
    preferences: { ...state.preferences, ...preferences },
  })),
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
