/**
 * LINE Messaging API Webhook の X-Line-Signature を検証する
 * https://developers.line.biz/ja/reference/messaging-api/#signature-validation
 *
 * - HMAC-SHA256 + base64
 * - タイミング攻撃を避けるため定数時間比較
 * - Convex の V8 ランタイムでも Web Crypto API（subtle）が利用可能
 */
export async function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
  const expected = bytesToBase64(sigBytes);

  return timingSafeEqual(expected, signatureHeader);
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
