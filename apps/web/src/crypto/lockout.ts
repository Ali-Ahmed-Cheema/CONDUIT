import { readLockoutRecord, writeLockoutRecord, type LockoutRecord, type VaultSetup } from "@conduit/storage";

const LEGACY_LOCKOUT_KEY = "conduit-lockout";
const DEFAULT_LOCKOUT: LockoutRecord = { failures: 0, until: 0 };
let lockoutState = DEFAULT_LOCKOUT;
let lockoutReady: Promise<void> | null = null;

const hexToBytes = (hex: string) =>
  new Uint8Array(hex.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16)) ?? []);

export const constantTimeEquals = (a: string, b: string) => {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < Math.min(aBytes.length, bBytes.length); i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
};

export async function derivePasswordHash(password: string, salt: string): Promise<string> {
  const worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<string>((resolve, reject) => {
      worker.onmessage = (event) => {
        const hex = event.data?.hex;
        if (typeof hex !== "string" || !/^[0-9a-f]{64}$/i.test(hex)) {
          reject(new Error("Password derivation returned invalid data."));
          return;
        }
        resolve(hex);
      };
      worker.onerror = () => reject(new Error("Password derivation failed."));
      worker.postMessage({ password, salt });
    });
  } finally {
    worker.terminate();
  }
}

async function importDataKey(hex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", hexToBytes(hex), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function deriveDataKey(password: string, saltData: string): Promise<CryptoKey> {
  return importDataKey(await derivePasswordHash(password, saltData));
}

export async function verifyPassword(password: string, setup: VaultSetup): Promise<boolean> {
  const actual = await derivePasswordHash(password, setup.saltVerify);
  return constantTimeEquals(actual, setup.verifier);
}

export async function createVaultCredentials(password: string): Promise<{ setup: VaultSetup; dataKey: CryptoKey }> {
  const saltVerify = crypto.getRandomValues(new Uint8Array(16));
  const saltData = crypto.getRandomValues(new Uint8Array(16));
  const toHex = (bytes: Uint8Array) =>
    Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
  const [verifier, dataKeyHex] = await Promise.all([
    derivePasswordHash(password, toHex(saltVerify)),
    derivePasswordHash(password, toHex(saltData)),
  ]);
  return {
    setup: {
      version: 1,
      saltVerify: toHex(saltVerify),
      verifier,
      saltData: toHex(saltData),
    },
    dataKey: await importDataKey(dataKeyHex),
  };
}

export async function initializeLockoutState(): Promise<void> {
  if (!lockoutReady) {
    lockoutReady = (async () => {
      const saved = await readLockoutRecord();
      if (saved) {
        lockoutState = saved;
        return;
      }

      const legacy = window.localStorage.getItem(LEGACY_LOCKOUT_KEY);
      let migrated = DEFAULT_LOCKOUT;
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy) as { failures?: unknown; until?: unknown };
          if (
            typeof parsed.failures === "number" &&
            Number.isSafeInteger(parsed.failures) &&
            parsed.failures >= 0 &&
            typeof parsed.until === "number" &&
            Number.isFinite(parsed.until) &&
            parsed.until >= 0
          ) {
            migrated = { failures: parsed.failures, until: parsed.until };
          }
        } catch {
          migrated = DEFAULT_LOCKOUT;
        }
      }
      await writeLockoutRecord(migrated);
      window.localStorage.removeItem(LEGACY_LOCKOUT_KEY);
      lockoutState = migrated;
    })();
  }
  await lockoutReady;
}

export const getLockoutState = () => lockoutState;

export const setLockoutState = async (failures: number, until: number) => {
  await initializeLockoutState();
  const next = { failures, until };
  await writeLockoutRecord(next);
  lockoutState = next;
};

export const resetLockoutState = () => setLockoutState(0, 0);

export const getLockoutRemainingSeconds = () => Math.max(0, Math.ceil((lockoutState.until - Date.now()) / 1000));

export const isLockoutActive = () => lockoutState.until > Date.now();

export const bumpLockout = async () => {
  await initializeLockoutState();
  const failures = lockoutState.failures + 1;
  const until = failures >= 3 ? Date.now() + Math.min(300, 5 * 2 ** (failures - 3)) * 1000 : 0;
  await setLockoutState(failures, until);
  return until;
};
