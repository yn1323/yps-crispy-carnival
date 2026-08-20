"use node";

import { v } from "convex/values";
import { getContactRecipientEmail, getContactSlackWebhookUrl, RESEND_FROM_EMAIL } from "../_lib/config";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { isNotificationDeliverySuppressed, logSuppressedNotification } from "../_lib/notificationDelivery";
import { getResendClient, sendResendEmail } from "../_lib/resend";
import { type ContactDeliveryInput, getContactTypeLabel } from "./schemas";

const contactTypeValidator = v.union(
  v.literal("introduction"),
  v.literal("usage"),
  v.literal("trouble"),
  v.literal("other"),
);

function contactEmailText(input: ContactDeliveryInput): string {
  return [
    `問い合わせ種別: ${getContactTypeLabel(input.type)}`,
    `氏名: ${input.name}`,
    `メールアドレス: ${input.email}`,
    `店舗名または会社名: ${input.organization || "未入力"}`,
    `リクエストID: ${input.requestId}`,
    "",
    "問い合わせ内容:",
    input.message,
  ].join("\n");
}

function escapeSlackMrkdwn(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function buildContactSlackPayload(input: ContactDeliveryInput) {
  const organization = input.organization || "未入力";
  return {
    text: "シフトリに新しい問い合わせが届きました",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "シフトリに新しい問い合わせが届きました" } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*種別*\n${escapeSlackMrkdwn(getContactTypeLabel(input.type))}` },
          { type: "mrkdwn", text: `*氏名*\n${escapeSlackMrkdwn(input.name)}` },
          { type: "mrkdwn", text: `*返信先*\n${escapeSlackMrkdwn(input.email)}` },
          { type: "mrkdwn", text: `*店舗・会社*\n${escapeSlackMrkdwn(organization)}` },
        ],
      },
      { type: "section", text: { type: "plain_text", text: `問い合わせ内容\n${input.message}` } },
      { type: "context", elements: [{ type: "plain_text", text: `Request ID: ${input.requestId}` }] },
    ],
  };
}

async function notifySlack(input: ContactDeliveryInput, suppressDelivery: boolean): Promise<void> {
  if (isNotificationDeliverySuppressed({ suppressDelivery })) {
    logSuppressedNotification("contact.slack", { requestIdPresent: input.requestId.length > 0 });
    return;
  }
  const webhookUrl = getContactSlackWebhookUrl();
  if (!webhookUrl) {
    console.error("Contact Slack webhook is not configured", { requestId: input.requestId });
    return;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildContactSlackPayload(input)),
    });
    if (!response.ok) {
      console.error("Contact Slack notification failed", { requestId: input.requestId, status: response.status });
    }
  } catch {
    console.error("Contact Slack notification failed", { requestId: input.requestId, status: "network_error" });
  }
}

export const deliver = internalAction({
  args: {
    input: v.object({
      type: contactTypeValidator,
      name: v.string(),
      email: v.string(),
      organization: v.string(),
      message: v.string(),
      requestId: v.string(),
    }),
  },
  handler: async (_ctx, { input }) => {
    const suppressDelivery = isNotificationDeliverySuppressed();
    const configuredRecipient = getContactRecipientEmail();
    if (!configuredRecipient && !suppressDelivery) return { status: "not_configured" as const };
    const recipient = configuredRecipient || "e2e-contact@shiftori.invalid";

    try {
      await sendResendEmail(
        getResendClient({ suppressDelivery }),
        {
          from: `シフトリ <${RESEND_FROM_EMAIL}>`,
          to: recipient,
          replyTo: input.email,
          subject: `【シフトリ】${getContactTypeLabel(input.type)}の問い合わせ`,
          text: contactEmailText(input),
        },
        "contact.submit",
        { idempotencyKey: `contact-${input.requestId}` },
      );
    } catch {
      return { status: "delivery_failed" as const };
    }

    await notifySlack(input, suppressDelivery);
    return { status: "accepted" as const };
  },
});
