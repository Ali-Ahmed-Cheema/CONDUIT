import { KDF_CONFIG } from "./config";

const KEY = "conduit-lockout";

export const constantTimeEquals = (a: string, b: string) => {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < Math.min(aBytes.length, bBytes.length); i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
};

export const getLockoutState = () => {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { failures: 0, until: 0 };

  try {
    const parsed = JSON.parse(raw) as { failures?: number; until?: number };
    return {
      failures: Number(parsed.failures ?? 0),
      until: Number(parsed.until ?? 0),
    };
  } catch {
    return { failures: 0, until: 0 };
  }
};

export const setLockoutState = (failures: number, until: number) => {
  localStorage.setItem(KEY, JSON.stringify({ failures, until }));
};

export const resetLockoutState = () => setLockoutState(0, 0);

export const getLockoutRemainingSeconds = () => {
  const { until } = getLockoutState();
  const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  return remaining;
};

export const isLockoutActive = () => {
  const { until } = getLockoutState();
  return until > Date.now();
};

export const bumpLockout = () => {
  const state = getLockoutState();
  const failures = state.failures + 1;
  const until = failures >= 3 ? Date.now() + Math.min(300, 5 * 2 ** (failures - 3)) * 1000 : 0;
  setLockoutState(failures, until);
  return until;
};

export const verifyPassword = async (password: string) => {
  const worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
  let result: string;
  try {
    result = await new Promise<string>((resolve, reject) => {
      worker.onmessage = (event) => resolve(event.data.hex as string);
      worker.onerror = () => reject(new Error("Password verification failed."));
      worker.postMessage({ password, salt: KDF_CONFIG.saltVerify });
    });
  } finally {
    worker.terminate();
  }
  return constantTimeEquals(result, KDF_CONFIG.verifier);
};

export const deriveDataKey = async (password: string) => {
  const worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
  let result: string;
  try {
    result = await new Promise<string>((resolve, reject) => {
      worker.onmessage = (event) => resolve(event.data.hex as string);
      worker.onerror = () => reject(new Error("Key derivation failed."));
      worker.postMessage({ password, salt: KDF_CONFIG.saltData });
    });
  } finally {
    worker.terminate();
  }

  const bytes = new Uint8Array(result.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16)) ?? []);
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
};
