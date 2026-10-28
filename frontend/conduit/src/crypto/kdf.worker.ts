const hexToBytes = (hex: string) =>
  new Uint8Array(hex.match(/.{1,2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);

self.onmessage = async (event: MessageEvent) => {
  const { password, salt } = event.data as { password: string; salt: string };
  const text = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey("raw", text, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations: 210000, salt: hexToBytes(salt) },
    key,
    256,
  );

  const out = Array.from(new Uint8Array(bits))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  self.postMessage({ hex: out });
};
