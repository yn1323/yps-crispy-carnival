import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { verifyResendWebhookSignature } from "../_lib/resendWebhookSignature";
import { isResendProviderIssueEventType, resendProviderIssueErrorMessage } from "./resendProviderEvents";

type ResendWebhookPayload = {
  type?: unknown;
  created_at?: unknown;
  data?: unknown;
};

type ResendEmailEventData = {
  created_at?: unknown;
  email_id?: unknown;
  tags?: unknown;
};

/**
 * Resend provider webhook 受信エンドポイント（V8 ランタイム）
 * - svix headers + raw body 署名検証が通るまで JSON parse / DB 更新しない
 * - delivered は受け取らず、遅延・失敗・拒否・抑止だけを FailureInbox へ流す
 */
export const webhookHandler = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RESEND_WEBHOOK_SECRET not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  const rawBody = await request.text();
  const valid = await verifyResendWebhookSignature(webhookSecret, rawBody, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: ResendWebhookPayload;
  try {
    body = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const normalized = normalizeProviderIssue(body, request.headers.get("svix-id"));
  if (!normalized) return new Response("OK", { status: 200 });

  await ctx.runMutation(internal.notificationOutbox.mutations.recordResendProviderIssue, normalized);
  return new Response("OK", { status: 200 });
});

function normalizeProviderIssue(body: ResendWebhookPayload, svixId: string | null) {
  if (!svixId || typeof body.type !== "string" || !isResendProviderIssueEventType(body.type)) return null;
  const data = asEmailEventData(body.data);
  if (!data || typeof data.email_id !== "string" || data.email_id.length === 0) return null;
  const outboxIdTag = readShiftoriOutboxIdTag(data.tags);

  return {
    providerEventId: svixId,
    providerEventType: body.type,
    providerEmailId: data.email_id,
    ...(outboxIdTag ? { outboxIdTag } : {}),
    occurredAt: parseResendEventTime(body.created_at, data.created_at),
    errorMessage: resendProviderIssueErrorMessage(body.type),
  };
}

function asEmailEventData(value: unknown): ResendEmailEventData | null {
  if (!value || typeof value !== "object") return null;
  return value as ResendEmailEventData;
}

function readShiftoriOutboxIdTag(tags: unknown) {
  if (!tags || typeof tags !== "object") return undefined;
  const value = (tags as Record<string, unknown>).shiftori_outbox_id;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseResendEventTime(eventCreatedAt: unknown, emailCreatedAt: unknown) {
  const eventTime = parseTimestamp(eventCreatedAt);
  if (eventTime !== null) return eventTime;
  const emailTime = parseTimestamp(emailCreatedAt);
  return emailTime ?? Date.now();
}

function parseTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
