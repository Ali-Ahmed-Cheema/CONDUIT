export const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export const makeTokenSummary = (reported?: { input?: number; output?: number }, estimated?: number) => {
  if (reported && (typeof reported.input === "number" || typeof reported.output === "number")) {
    return `Reported: ${reported.input ?? 0} in - ${reported.output ?? 0} out`;
  }
  return typeof estimated === "number" ? `Estimated (not exact): ~${estimated}` : "";
};
