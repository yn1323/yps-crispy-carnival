const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const SECRET_PREFIX = "whsec_";

type ResendWebhookSignatureHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export async function verifyResendWebhookSignature(
  secret: string,
  rawBody: string,
  headers: ResendWebhookSignatureHeaders,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  const timestampSeconds = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) return false;
  const timestampMs = timestampSeconds * 1000;
  if (Math.abs(nowMs - timestampMs) > WEBHOOK_TOLERANCE_MS) return false;

  const keyBytes = decodeWebhookSecret(secret);
  if (!keyBytes) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const payload = `${headers.id}.${timestampSeconds}.${rawBody}`;
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  const expected = bytesToBase64(sigBytes);

  for (const versionedSignature of headers.signature.split(" ")) {
    const [version, signature] = versionedSignature.split(",");
    if (version === "v1" && signature && timingSafeEqual(signature, expected)) return true;
  }

  return false;
}

function decodeWebhookSecret(secret: string): Uint8Array | null {
  const value = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
