import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getAppUrl, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { buildOrganizationBillingEmailHtml } from "../notification/templates";
import { emailPayload, enqueueEmail, organizationManagerInvitationEmailPayload } from "../notificationOutbox/enqueue";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";

export const enqueueManagerInvitation = internalAction({
  args: {
    invitationId: v.id("organizationInvitations"),
    expectedVersion: v.number(),
    ...businessNotificationOriginArgs,
  },
  returns: v.object({ enqueued: v.boolean() }),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.organizationInvitation.queries.getEnqueueData, args);
    if (!data) return { enqueued: false };

    const result = await enqueueEmail(ctx, {
      organizationId: data.organizationId,
      ...businessNotificationOriginFrom(args),
      organizationInvitationId: args.invitationId,
      organizationInvitationVersion: data.invitationVersion,
      purpose: "business",
      dedupeKey: `email:organizationManagerInvitation:${args.invitationId}:${data.invitationVersion}`,
      payload: organizationManagerInvitationEmailPayload({
        from: formatResendFrom(data.organizationName, RESEND_FROM_EMAIL),
        to: data.email,
        context: "organizationInvitation.enqueueManagerInvitation",
      }),
    });
    return { enqueued: result !== null };
  },
});

export const enqueueAcceptanceNotifications = internalAction({
  args: {
    invitationId: v.id("organizationInvitations"),
    expectedVersion: v.number(),
    ...businessNotificationOriginArgs,
  },
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.organizationInvitation.queries.getAcceptanceNotificationData, args);
    if (!data) return { enqueuedCount: 0 };

    const settingsUrl = new URL("/settings", getAppUrl()).toString();
    let enqueuedCount = 0;
    for (const recipient of data.recipients) {
      const result = await enqueueEmail(ctx, {
        organizationId: data.organizationId,
        ...businessNotificationOriginFrom(args),
        userId: recipient.userId,
        purpose: "business",
        dedupeKey: `email:organizationManagerInvitationAccepted:${args.invitationId}:${args.expectedVersion}:${recipient.userId}`,
        payload: emailPayload({
          from: formatResendFrom(data.organizationName, RESEND_FROM_EMAIL),
          to: recipient.email,
          subject: formatResendSubject(data.organizationName, "管理者の招待が承認されました"),
          html: buildOrganizationBillingEmailHtml({
            recipientName: recipient.name,
            organizationName: data.organizationName,
            heading: "管理者の招待が承認されました",
            paragraphs: ["新しい管理者が事業者へ参加しました。すべての店舗と契約操作を管理できます。"],
            action: { label: "事業者設定を確認する", url: settingsUrl },
          }),
          context: "organizationInvitation.accepted",
        }),
      });
      if (result) enqueuedCount += 1;
    }
    return { enqueuedCount };
  },
});
