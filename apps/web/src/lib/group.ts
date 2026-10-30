import { dayKey, F } from "./time";

export type GroupLabel = "Today" | "Yesterday" | "Previous 7 Days" | string;

export const groupConversations = <T extends { id: string; createdAt: number; title?: string; provider?: string; model?: string }>(
  conversations: T[],
) => {
  const groups = new Map<string, T[]>();
  const today = Date.parse(dayKey(Date.now()));

  for (const conversation of conversations) {
    const d = (today - Date.parse(dayKey(conversation.createdAt))) / 86400000;
    const label =
      d < 1 ? "Today" : d < 2 ? "Yesterday" : d <= 7 ? "Previous 7 Days" : F({ month: "long", year: "numeric" }).format(conversation.createdAt);

    const key = label;
    const current = groups.get(key) ?? [];
    current.push(conversation);
    groups.set(key, current);
  }

  return groups;
};
