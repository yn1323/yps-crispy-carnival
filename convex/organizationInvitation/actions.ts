import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { getAppUrl, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { selectChannel } from "../_lib/notification";
import { buildOrganizationBillingEmailHtml } from "../notification/templates";
import {
  emailPayload,
  enqueueEmail,
  enqueueLine,
  organizationManagerInvitationEmailPayload,
  organizationManagerInvitationLinePayload,
} from "../notificationOutbox/enqueue";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";

type ManagerInvitationEnqueueData = {
  organizationId: Id<"organizations">;
  organizationName: string;
  email: string;
  invitationVersion: number;
  staffId?: Id<"staffs">;
  lineUserId?: string;
};

export const enqueueManagerInvitation = internalAction({
  args: {
    invitationId: v.id("organizationInvitations"),
    expectedVersion: v.number(),
    ...businessNotificationOriginArgs,
  },
  returns: v.object({ enqueued: v.boolean() }),
  handler: async (ctx, args): Promise<{ enqueued: boolean }> => {
    const data: ManagerInvitationEnqueueData | null = await ctx.runQuery(
      internal.organizationInvitation.queries.getEnqueueData,
      args,
    );
    if (!data) return { enqueued: false };

    const origin = businessNotificationOriginFrom(args);
    const from = formatResendFrom(data.organizationName, RESEND_FROM_EMAIL);
    const email = organizationManagerInvitationEmailPayload({
      from,
      to: data.email,
      context: "organizationInvitation.enqueueManagerInvitation",
    });
    const quota = data.lineUserId ? await ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {}) : null;
    const channel = selectChannel({ lineUserId: data.lineUserId, lineFollowing: Boolean(data.lineUserId) }, quota);
    const result: { outboxId: Id<"notificationOutbox">; deduped: boolean } | null =
      channel === "line" && data.lineUserId && data.staffId
        ? await enqueueLine(ctx, {
            organizationId: data.organizationId,
            ...origin,
            staffId: data.staffId,
            organizationInvitationId: args.invitationId,
            organizationInvitationVersion: data.invitationVersion,
            purpose: "business",
            dedupeKey: `line:organizationManagerInvitation:${args.invitationId}:${data.invitationVersion}`,
            payload: organizationManagerInvitationLinePayload({
              toUserId: data.lineUserId,
              context: "organizationInvitation.enqueueManagerInvitation",
              fallbackEmail: {
                dedupeKey: `email:organizationManagerInvitation:${args.invitationId}:${data.invitationVersion}`,
                payload: email,
              },
            }),
          })
        : await enqueueEmail(ctx, {
            organizationId: data.organizationId,
            ...origin,
            organizationInvitationId: args.invitationId,
            organizationInvitationVersion: data.invitationVersion,
            purpose: "business",
            dedupeKey: `email:organizationManagerInvitation:${args.invitationId}:${data.invitationVersion}`,
            payload: email,
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
          subject: formatResendSubject(data.organizationName, "管理者のアカウント連携が完了しました"),
          html: buildOrganizationBillingEmailHtml({
            recipientName: recipient.name,
            organizationName: data.organizationName,
            heading: "管理者のアカウント連携が完了しました",
            paragraphs: ["新しい管理者のアカウントがグループに連携されました。"],
            action: { label: "グループ設定を確認する", url: settingsUrl },
          }),
          context: "organizationInvitation.linked",
        }),
      });
      if (result) enqueuedCount += 1;
    }
    return { enqueuedCount };
  },
});
