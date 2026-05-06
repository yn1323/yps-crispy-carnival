import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { verifyLineSignature } from "../_lib/lineSignature";

type LineEvent =
  | { type: "follow"; source: { userId?: string } }
  | { type: "unfollow"; source: { userId?: string } }
  | { type: "message"; replyToken: string; source: { userId?: string }; message: { type: string } }
  | { type: string; source?: { userId?: string }; replyToken?: string };

type LineWebhookBody = {
  destination: string;
  events: LineEvent[];
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

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  const valid = await verifyLineSignature(channelSecret, rawBody, signature);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = body.events ?? [];
  const dispatched = await ctx.runMutation(internal.line.mutations.dispatchWebhookEvents, {
    events: events.map((e) => ({
      type: e.type,
      userId: e.source?.userId,
      replyToken: "replyToken" in e ? e.replyToken : undefined,
    })),
  });

  // message イベントだけ Reply API（外部 fetch）が必要なので action に流す
  for (const replyToken of dispatched.replyTokens) {
    await ctx.runAction(internal.line.actions.replyDefaultMessage, { replyToken });
  }

  return new Response("OK", { status: 200 });
});
