"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import {
  buildStaffLegalConsentEmailHtml,
  buildStaffLegalConsentLineFlexMessage,
  buildStaffLegalConsentLineText,
  STAFF_LEGAL_CONSENT_SUBJECT,
} from "../notification/templates";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";
import { lineRecipientOutboxSnapshot } from "../notificationOutbox/types";

const LEGAL_CONSENT_NOTIFICATION_KIND = "legal.consent";
const LEGAL_CONSENT_LINE_TITLE = "利用規約への同意のお願い";

export const sendStaffConsentEmail = internalAction({
  args: { staffId: v.id("staffs"), ...businessNotificationOriginArgs },
  handler: async (ctx, { staffId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(internal.legal.queries.getStaffConsentNotificationDataInternal, {
      staffId,
    });
    if (!data?.staffEmail) return;
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );

    const { token, expiresAt } = await ctx.runMutation(internal.legal.mutations.createStaffConsentToken, {
      staffId: data.staffId,
      shopId: data.shopId,
      method: "staff_email_link",
    });
    const consentUrl = `${APP_URL}/legal/staff/consent?token=${token}`;
    const subject = formatResendSubject(data.shopName, STAFF_LEGAL_CONSENT_SUBJECT);

    await enqueueEmail(ctx, {
      shopId: data.shopId,
      ...notificationOrigin,
      purpose: "business",
      staffId: data.staffId,
      history: {
        notificationKind: LEGAL_CONSENT_NOTIFICATION_KIND,
        displayTitle: subject,
      },
      dedupeKey: `email:legalConsent:${staffId}`,
      payload: emailPayload({
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: data.staffEmail,
        subject,
        html: buildStaffLegalConsentEmailHtml({
          staffName: data.staffName,
          shopName: data.shopName,
          consentUrl,
          expiresAt,
          documents: data.documents,
        }),
        context: "legal.sendStaffConsentEmail",
        suppressDelivery,
      }),
    });
  },
});

export const sendStaffConsentLine = internalAction({
  args: { staffId: v.id("staffs"), ...businessNotificationOriginArgs },
  handler: async (ctx, { staffId, organizationBillingVersionAtOrigin }) => {
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(internal.legal.queries.getStaffConsentNotificationDataInternal, { staffId });
    const lineRecipient = data?.lineRecipient;
    if (!data || !lineRecipient?.following) return;
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );

    const { token, expiresAt } = await ctx.runMutation(internal.legal.mutations.createStaffConsentToken, {
      staffId: data.staffId,
      shopId: data.shopId,
      method: "line_link_notice",
    });
    const consentUrl = `${APP_URL}/legal/staff/consent?token=${token}`;
    const subject = formatResendSubject(data.shopName, STAFF_LEGAL_CONSENT_SUBJECT);

    try {
      const lineParams = {
        staffName: data.staffName,
        shopName: data.shopName,
        consentUrl,
        expiresAt,
      };
      const fallbackEmail = data.staffEmail
        ? {
            dedupeKey: `email:legalConsent:${staffId}`,
            history: {
              notificationKind: LEGAL_CONSENT_NOTIFICATION_KIND,
              displayTitle: subject,
            },
            payload: emailPayload({
              from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
              to: data.staffEmail,
              subject,
              html: buildStaffLegalConsentEmailHtml({
                staffName: data.staffName,
                shopName: data.shopName,
                consentUrl,
                expiresAt,
                documents: data.documents,
              }),
              context: "legal.sendStaffConsentEmail",
              suppressDelivery,
            }),
          }
        : undefined;
      await enqueueLine(ctx, {
        shopId: data.shopId,
        ...notificationOrigin,
        ...lineRecipientOutboxSnapshot(lineRecipient),
        purpose: "business",
        staffId: data.staffId,
        history: {
          notificationKind: LEGAL_CONSENT_NOTIFICATION_KIND,
          displayTitle: LEGAL_CONSENT_LINE_TITLE,
        },
        dedupeKey: `line:legalConsent:${staffId}`,
        payload: linePayload({
          toUserId: lineRecipient.lineUserId,
          text: buildStaffLegalConsentLineText(lineParams),
          message: buildStaffLegalConsentLineFlexMessage(lineParams),
          suppressDelivery,
          ...(fallbackEmail ? { fallbackEmail } : {}),
        }),
      });
    } catch (e) {
      console.error("Staff legal consent LINE enqueue failed", e);
    }
  },
});
