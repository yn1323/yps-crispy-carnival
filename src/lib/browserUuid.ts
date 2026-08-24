type BrowserCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

export class BrowserCryptoUnavailableError extends Error {
  readonly code = "browser_crypto_unavailable";

  constructor() {
    super("安全な操作IDを作成できません。ブラウザを更新して、もう一度お試しください。");
    this.name = "BrowserCryptoUnavailableError";
  }
}

export function createBrowserUuid(cryptoApi: BrowserCrypto | null | undefined = globalThis.crypto): string {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== "function") throw new BrowserCryptoUnavailableError();

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
    .slice(8, 10)
    .join("")}-${hex.slice(10).join("")}`;
}
