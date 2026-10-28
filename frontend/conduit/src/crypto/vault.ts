import { openDB } from "idb";

const dbPromise = openDB("conduit-v3", 1, {
  upgrade(database) {
    if (!database.objectStoreNames.contains("vault")) {
      database.createObjectStore("vault");
    }
  },
});
let writeQueue: Promise<void> = Promise.resolve();

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => {
  const cleaned = hex.replace(/\s+/g, "");
  if (cleaned.length % 2 !== 0) return new Uint8Array();
  return new Uint8Array(cleaned.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
};

export const encryptVaultValue = async (key: CryptoKey, payload: unknown) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return {
    iv: toHex(iv),
    ciphertext: toHex(new Uint8Array(ciphertext)),
  };
};

export const decryptVaultValue = async (key: CryptoKey, payload: { iv: string; ciphertext: string }) => {
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(payload.iv) },
    key,
    fromHex(payload.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

export const writeVault = (key: CryptoKey, value: unknown) => {
  const save = writeQueue.then(async () => {
    const db = await dbPromise;
    const encrypted = await encryptVaultValue(key, value);
    await db.put("vault", encrypted, "data");
  });
  writeQueue = save.catch(() => undefined);
  return save;
};

export const readVault = async (key: CryptoKey) => {
  const db = await dbPromise;
  const encrypted = (await db.get("vault", "data")) as { iv?: string; ciphertext?: string } | undefined;
  if (!encrypted?.iv || !encrypted?.ciphertext) return { keys: [], chats: [], settings: {} };
  const saved = await decryptVaultValue(key, { iv: encrypted.iv, ciphertext: encrypted.ciphertext });
  if (!saved || typeof saved !== "object") throw new Error("Saved vault data has an invalid format.");
  const value = saved as { keys?: unknown; chats?: unknown; settings?: unknown };
  return {
    keys: Array.isArray(value.keys) ? value.keys : [],
    chats: Array.isArray(value.chats) ? value.chats : [],
    settings: value.settings && typeof value.settings === "object" ? value.settings as Record<string, unknown> : {},
  };
};

export const clearVault = async () => {
  const clear = writeQueue.then(async () => {
    const db = await dbPromise;
    await db.delete("vault", "data");
  });
  writeQueue = clear.catch(() => undefined);
  return clear;
};
