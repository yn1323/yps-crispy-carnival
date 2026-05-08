"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { pushTextMessage } from "../_lib/lineClient";
import { getResendClient } from "../_lib/resend";
import { buildStaffLegalConsentEmailHtml, buildStaffLegalConsentLineText } from "../email/templates";

const APP_URL = process.env.APP_URL ?? "https://shiftori.app";
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@shiftori.app";

export const sendStaffConsentEmail = internalAction({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const data = await ctx.runQuery(internal.legal.queries.getStaffConsentNotificationDataInternal, { staffId });
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

    const resend = getResendClient({ suppressDelivery });
    await resend.emails.send({
      from: formatResendFrom(data.shopName, RESEND_FROM),
      to: data.staffEmail,
      subject: formatResendSubject(data.shopName, "シフト管理サービスの利用規約・プライバシーポリシー確認のお願い"),
      html: buildStaffLegalConsentEmailHtml({
        staffName: data.staffName,
        shopName: data.shopName,
        consentUrl,
        expiresAt,
        documents: data.documents,
      }),
    });
  },
});

export const sendStaffConsentLine = internalAction({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const data = await ctx.runQuery(internal.legal.queries.getStaffConsentNotificationDataInternal, { staffId });
    if (!data?.lineUserId || data.lineFollowing === false) return;
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

    try {
      await pushTextMessage(
        data.lineUserId,
        buildStaffLegalConsentLineText({
          staffName: data.staffName,
          shopName: data.shopName,
          consentUrl,
          expiresAt,
        }),
        { suppressDelivery },
      );
    } catch (e) {
      console.error("Staff legal consent LINE push failed", e);
    }
  },
});
