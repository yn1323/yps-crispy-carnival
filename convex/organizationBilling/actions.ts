"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getAppUrl, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { isReleaseFeatureEnabled } from "../_lib/releaseFeatures";
import { buildOrganizationBillingEmailHtml } from "../notification/templates";
import { emailPayload, enqueueEmail } from "../notificationOutbox/enqueue";
import {
  organizationBillingNotificationCopy,
  organizationBillingNotificationDetailsValidator,
  organizationBillingNotificationEventValidator,
} from "./notification";

export const enqueueBillingNotification = internalAction({
  args: {
    organizationId: v.id("organizations"),
    event: organizationBillingNotificationEventValidator,
    eventKey: v.string(),
    recipientUserIds: v.optional(v.array(v.id("users"))),
    expectedDeadlineAt: v.optional(v.number()),
    notificationDetails: v.optional(organizationBillingNotificationDetailsValidator),
  },
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx, args) => {
    if (!isReleaseFeatureEnabled("billing")) return { enqueuedCount: 0 };

    const data = await ctx.runQuery(internal.organizationBilling.queries.getNotificationData, {
      organizationId: args.organizationId,
      event: args.event,
      recipientUserIds: args.recipientUserIds,
      expectedDeadlineAt: args.expectedDeadlineAt,
    });
    if (!data) return { enqueuedCount: 0 };

    const copy = organizationBillingNotificationCopy(args.event, data.trialEnding, args.notificationDetails);
    const settingsUrl = new URL("/manage/billing", getAppUrl());
    settingsUrl.searchParams.set("org", data.organizationId);
    let enqueuedCount = 0;
    for (const recipient of data.recipients) {
      const result = await enqueueEmail(ctx, {
        organizationId: data.organizationId,
        userId: recipient.userId,
        purpose: "billing",
        dedupeKey: `email:organizationBilling:${args.eventKey}:${recipient.userId}`,
        payload: emailPayload({
          from: formatResendFrom(data.organizationName, RESEND_FROM_EMAIL),
          to: recipient.email,
          subject: formatResendSubject(data.organizationName, copy.subject),
          html: buildOrganizationBillingEmailHtml({
            recipientName: recipient.name,
            organizationName: data.organizationName,
            heading: copy.heading,
            paragraphs: copy.paragraphs,
            action: { label: "組織設定を確認する", url: settingsUrl.toString() },
          }),
          context: `organizationBilling.${args.event}`,
        }),
      });
      if (result) enqueuedCount += 1;
    }
    return { enqueuedCount };
  },
});
