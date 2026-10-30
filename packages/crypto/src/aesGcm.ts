const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("Saved vault data contains invalid hexadecimal data.");
  return new Uint8Array(hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
};

export async function encryptVaultValue(key: CryptoKey, payload: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return {
    iv: toHex(iv),
    ciphertext: toHex(new Uint8Array(ciphertext)),
  };
}

export async function decryptVaultValue(key: CryptoKey, payload: { iv: string; ciphertext: string }): Promise<unknown> {
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(payload.iv) },
    key,
    fromHex(payload.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
