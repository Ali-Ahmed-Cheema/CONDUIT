import type { ChatConversation } from "../store";

export function downloadConversation(conversation: ChatConversation, format: "markdown" | "json"): void {
  const body = format === "json"
    ? JSON.stringify(conversation, null, 2)
    : `# ${conversation.title}\n\n${conversation.messages
        .map((message) => `## ${message.role === "user" ? "You" : "Assistant"}\n\n${message.content}`)
        .join("\n\n")}\n`;
  const file = new Blob([body], { type: format === "json" ? "application/json" : "text/markdown" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  const safeTitle = conversation.title.replace(/[\\/:*?"<>|]+/g, "-") || "conversation";
  link.download = `${safeTitle}.${format === "json" ? "json" : "md"}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
