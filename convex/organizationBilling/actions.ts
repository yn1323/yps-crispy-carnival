"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getAppUrl, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { buildOrganizationBillingEmailHtml } from "../notification/templates";
import { emailPayload, enqueueEmail } from "../notificationOutbox/enqueue";
import { organizationBillingEmailChangedNotificationCopy } from "./notification";

export const enqueueBillingEmailChangedNotification = internalAction({
  args: {
    organizationId: v.id("organizations"),
    eventKey: v.string(),
  },
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.organizationBilling.queries.getBillingEmailChangedNotificationData, {
      organizationId: args.organizationId,
    });
    if (!data) return { enqueuedCount: 0 };

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
          subject: formatResendSubject(data.organizationName, organizationBillingEmailChangedNotificationCopy.subject),
          html: buildOrganizationBillingEmailHtml({
            recipientName: recipient.name,
            organizationName: data.organizationName,
            heading: organizationBillingEmailChangedNotificationCopy.heading,
            paragraphs: organizationBillingEmailChangedNotificationCopy.paragraphs,
            action: { label: "シフトリを確認する", url: settingsUrl.toString() },
          }),
          context: "organizationBilling.billingEmailChanged",
        }),
      });
      if (result) enqueuedCount += 1;
    }
    return { enqueuedCount };
  },
});
