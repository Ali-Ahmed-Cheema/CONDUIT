export const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export const makeTokenSummary = (reported?: { input?: number; output?: number }, estimated?: number) => {
  const parts: string[] = [];
  if (reported && typeof reported.input === "number" && typeof reported.output === "number") {
    parts.push(`Reported: ${reported.input} in - ${reported.output} out`);
  }
  if (typeof estimated === "number") {
    parts.push(`Estimated (not exact): ~${estimated}`);
  }
  return parts.join("  ");
};
