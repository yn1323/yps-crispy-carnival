import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { readBoundedJsonBody } from "../_lib/httpBody";
import { verifyLineSignature } from "../_lib/lineSignature";
import { LINE_WEBHOOK_BODY_MAX_BYTES, LINE_WEBHOOK_EVENT_MAX_COUNT } from "../constants";

type DispatchEvent = {
  type: string;
  userId?: string;
  replyToken?: string;
};

/**
 * LINE Messaging API Webhook 受信エンドポイント（V8 ランタイム）
 * - X-Line-Signature の HMAC-SHA256 検証
 * - rate limit と DB 書き込みは internal mutation に委譲
 * - follow / unfollow / message のみ処理。それ以外は無視
 */
export const webhookHandler = httpAction(async (ctx, request) => {
  const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error("LINE_MESSAGING_CHANNEL_SECRET not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  const bodyResult = await readBoundedJsonBody(request, LINE_WEBHOOK_BODY_MAX_BYTES);
  if (!bodyResult.ok) return bodyErrorResponse(bodyResult.error);

  const rawBody = bodyResult.rawBody;
  const signature = request.headers.get("x-line-signature");
  const valid = await verifyLineSignature(channelSecret, rawBody, signature);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!isRecord(body) || !Array.isArray(body.events)) {
    return new Response("Invalid webhook payload", { status: 400 });
  }
  if (body.events.length > LINE_WEBHOOK_EVENT_MAX_COUNT) {
    return new Response("Too many events", { status: 413 });
  }

  const events = parseDispatchEvents(body.events);
  if (!events) return new Response("Invalid webhook payload", { status: 400 });

  const dispatched = await ctx.runMutation(internal.line.mutations.dispatchWebhookEvents, {
    events,
  });

  // message イベントだけ Reply API（外部 fetch）が必要なので action に流す
  for (const replyToken of dispatched.replyTokens) {
    await ctx.runAction(internal.line.actions.replyDefaultMessage, { replyToken });
  }

  return new Response("OK", { status: 200 });
});

function parseDispatchEvents(events: unknown[]): DispatchEvent[] | null {
  const parsed: DispatchEvent[] = [];
  for (const event of events) {
    if (!isRecord(event) || typeof event.type !== "string") return null;

    const source = event.source;
    if (source !== undefined && (!isRecord(source) || !isOptionalString(source.userId))) return null;
    if (!isOptionalString(event.replyToken)) return null;

    parsed.push({
      type: event.type,
      ...(isRecord(source) && typeof source.userId === "string" ? { userId: source.userId } : {}),
      ...(typeof event.replyToken === "string" ? { replyToken: event.replyToken } : {}),
    });
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function bodyErrorResponse(error: "unsupported_media_type" | "body_too_large" | "invalid_body") {
  if (error === "unsupported_media_type") return new Response("Unsupported media type", { status: 415 });
  if (error === "body_too_large") return new Response("Request body too large", { status: 413 });
  return new Response("Invalid request body", { status: 400 });
}
