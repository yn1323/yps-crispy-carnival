import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getAppUrl, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { isDryRunManagerEmail } from "../_lib/notificationDelivery";
import {
  buildOrganizationBillingEmailHtml,
  ORGANIZATION_MANAGER_INVITATION_ACCEPTED_CTA,
  ORGANIZATION_MANAGER_INVITATION_ACCEPTED_SUBJECT,
} from "../notification/templates";
import { emailPayload, enqueueEmail, organizationManagerInvitationEmailPayload } from "../notificationOutbox/enqueue";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";

type ManagerInvitationEnqueueData = {
  organizationId: Id<"organizations">;
  organizationName: string;
  email: string;
  invitationVersion: number;
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
      {
        invitationId: args.invitationId,
        expectedVersion: args.expectedVersion,
      },
    );
    if (!data) return { enqueued: false };

    const origin = businessNotificationOriginFrom(args);
    const from = formatResendFrom(data.organizationName, RESEND_FROM_EMAIL);
    const result: { outboxId: Id<"notificationOutbox">; deduped: boolean } | null = await enqueueEmail(ctx, {
      organizationId: data.organizationId,
      ...origin,
      organizationInvitationId: args.invitationId,
      organizationInvitationVersion: data.invitationVersion,
      purpose: "business",
      dedupeKey: `email:organizationManagerInvitation:${args.invitationId}:${data.invitationVersion}`,
      payload: organizationManagerInvitationEmailPayload({
        from,
        to: data.email,
        context: "organizationInvitation.enqueueManagerInvitation",
        suppressDelivery: isDryRunManagerEmail(data.email),
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
    const data = await ctx.runQuery(internal.organizationInvitation.queries.getAcceptanceNotificationData, {
      invitationId: args.invitationId,
      expectedVersion: args.expectedVersion,
    });
    if (!data) return { enqueuedCount: 0 };

    const settingsUrl = new URL("/manage/managers", getAppUrl());
    settingsUrl.searchParams.set("org", data.organizationId);
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
          subject: formatResendSubject(data.organizationName, ORGANIZATION_MANAGER_INVITATION_ACCEPTED_SUBJECT),
          html: buildOrganizationBillingEmailHtml({
            recipientName: recipient.name,
            organizationName: data.organizationName,
            heading: ORGANIZATION_MANAGER_INVITATION_ACCEPTED_SUBJECT,
            headingSize: "normal",
            paragraphs: [],
            action: { label: ORGANIZATION_MANAGER_INVITATION_ACCEPTED_CTA, url: settingsUrl.toString() },
          }),
          context: "organizationInvitation.linked",
          suppressDelivery: isDryRunManagerEmail(recipient.email),
        }),
      });
      if (result) enqueuedCount += 1;
    }
    return { enqueuedCount };
  },
});
