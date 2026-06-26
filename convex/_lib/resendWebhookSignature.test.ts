import { describe, expect, it } from "vitest";
import { verifyResendWebhookSignature } from "./resendWebhookSignature";

const RAW_SECRET = "test-resend-webhook-secret";
const SECRET = `whsec_${bytesToBase64(new TextEncoder().encode(RAW_SECRET))}`;
const BODY = JSON.stringify({
  type: "email.delivery_delayed",
  created_at: "2026-06-22T05:23:00.000Z",
  data: { email_id: "email_123", tags: { shiftori_outbox_id: "outbox_123" } },
});
const SVIX_ID = "msg_test";
const TIMESTAMP_SECONDS = 1_772_605_380;
const NOW_MS = TIMESTAMP_SECONDS * 1000;

async function signWith(secret: string, body: string, timestampSeconds = TIMESTAMP_SECONDS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${SVIX_ID}.${timestampSeconds}.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `v1,${bytesToBase64(sig)}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

describe("verifyResendWebhookSignature", () => {
  it("正しいsvix署名は通る", async () => {
    const signature = await signWith(RAW_SECRET, BODY);

    await expect(
      verifyResendWebhookSignature(
        SECRET,
        BODY,
        { id: SVIX_ID, timestamp: String(TIMESTAMP_SECONDS), signature },
        NOW_MS,
      ),
    ).resolves.toBe(true);
  });

  it("複数署名のうち正しいv1署名があれば通る", async () => {
    const signature = await signWith(RAW_SECRET, BODY);

    await expect(
      verifyResendWebhookSignature(
        SECRET,
        BODY,
        { id: SVIX_ID, timestamp: String(TIMESTAMP_SECONDS), signature: `v1,wrong ${signature}` },
        NOW_MS,
      ),
    ).resolves.toBe(true);
  });

  it("署名ヘッダーが欠けているとfalse", async () => {
    await expect(
      verifyResendWebhookSignature(
        SECRET,
        BODY,
        { id: SVIX_ID, timestamp: String(TIMESTAMP_SECONDS), signature: null },
        NOW_MS,
      ),
    ).resolves.toBe(false);
  });

  it("bodyが改ざんされているとfalse", async () => {
    const signature = await signWith(RAW_SECRET, BODY);

    await expect(
      verifyResendWebhookSignature(
        SECRET,
        `${BODY}x`,
        { id: SVIX_ID, timestamp: String(TIMESTAMP_SECONDS), signature },
        NOW_MS,
      ),
    ).resolves.toBe(false);
  });

  it("timestampが許容時間外ならfalse", async () => {
    const oldTimestamp = TIMESTAMP_SECONDS - 301;
    const signature = await signWith(RAW_SECRET, BODY, oldTimestamp);

    await expect(
      verifyResendWebhookSignature(SECRET, BODY, { id: SVIX_ID, timestamp: String(oldTimestamp), signature }, NOW_MS),
    ).resolves.toBe(false);
  });
});
