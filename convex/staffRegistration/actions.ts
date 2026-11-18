"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import { selectChannel } from "../_lib/notification";
import { getNotificationDeliveryBehavior } from "../_lib/notificationDelivery";
import { getResendClient, sendResendEmail } from "../_lib/resend";
import {
  MINUTE_MS,
  STAFF_REGISTRATION_DAILY_DIGEST_PENDING_PAGE_SIZE,
  STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
} from "../constants";
import {
  buildStaffRegistrationOwnerDigestEmailHtml,
  buildStaffRegistrationOwnerDigestLineFlexMessage,
  buildStaffRegistrationOwnerDigestLineText,
  buildStaffRegistrationVerificationCodeEmailHtml,
  buildStaffRegistrationVerificationCodeSubject,
  STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT,
} from "../notification/templates";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";
import { STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT } from "../notificationOutbox/shopManagerNotification";
import { lineRecipientOutboxSnapshot } from "../notificationOutbox/types";
import { STAFF_REGISTRATION_VERIFICATION_CODE_CONTEXT } from "./verificationCode";

type PendingRequestShopIdsPage = {
  page: Id<"shops">[];
  continueCursor: string;
  isDone: boolean;
};

export const sendOwnerDailyDigest = internalAction({
  args: { shopId: v.optional(v.id("shops")) },
  handler: async (ctx, { shopId }) => {
    // E2Eや運用確認では対象店舗だけを実行し、同じdeploymentの他店舗へ影響させない。
    if (shopId) {
      await sendOwnerDigestForShop(ctx, shopId);
      return;
    }

    const notifiedShopIds = new Set<string>();
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const result: PendingRequestShopIdsPage = await ctx.runQuery(
        internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage,
        {
          paginationOpts: {
            numItems: STAFF_REGISTRATION_DAILY_DIGEST_PENDING_PAGE_SIZE,
            cursor,
          },
        },
      );

      for (const shopId of result.page) {
        if (notifiedShopIds.has(shopId)) continue;
        notifiedShopIds.add(shopId);
        await sendOwnerDigestForShop(ctx, shopId);
      }

      cursor = result.continueCursor;
      isDone = result.isDone;
    }
  },
});

async function sendOwnerDigestForShop(ctx: ActionCtx, shopId: Id<"shops">) {
  const data = await ctx.runQuery(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
    shopId,
  });
  if (!data) return;

  const [quota, suppressDelivery, notificationOrigin] = await Promise.all([
    ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {}),
    ctx.runQuery(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, {
      shopId: data.shopId,
    }),
    ctx.runQuery(internal.notificationOutbox.origin.captureCurrentBusinessNotificationOrigin, {
      shopId: data.shopId,
    }),
  ]);

  for (const recipient of data.recipients) {
    const lineRecipient = recipient.lineRecipient;
    const channel = selectChannel(
      { lineUserId: lineRecipient?.lineUserId, lineFollowing: lineRecipient?.following },
      quota,
    );

    if (channel === "line" && lineRecipient) {
      await enqueueLine(ctx, {
        shopId: data.shopId,
        ...notificationOrigin,
        ...lineRecipientOutboxSnapshot(lineRecipient),
        purpose: "business",
        userId: recipient.userId,
        dedupeKey: `line:staffRegistrationDailyDigest:${data.shopId}:${recipient.userId}`,
        payload: linePayload({
          toUserId: lineRecipient.lineUserId,
          text: buildStaffRegistrationOwnerDigestLineText({
            dashboardUrl: data.dashboardUrl,
          }),
          message: buildStaffRegistrationOwnerDigestLineFlexMessage({
            shopName: data.shopName,
            dashboardUrl: data.dashboardUrl,
          }),
          suppressDelivery,
          fallbackEmail: {
            dedupeKey: `email:staffRegistrationDailyDigest:${data.shopId}:${recipient.userId}`,
            payload: emailPayload({
              from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
              to: recipient.email,
              subject: formatResendSubject(data.shopName, STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT),
              html: buildStaffRegistrationOwnerDigestEmailHtml({
                managerName: recipient.name,
                dashboardUrl: data.dashboardUrl,
              }),
              context: STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT,
              suppressDelivery,
            }),
          },
        }),
      });
      continue;
    }

    await enqueueEmail(ctx, {
      shopId: data.shopId,
      ...notificationOrigin,
      purpose: "business",
      userId: recipient.userId,
      dedupeKey: `email:staffRegistrationDailyDigest:${data.shopId}:${recipient.userId}`,
      payload: emailPayload({
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: recipient.email,
        subject: formatResendSubject(data.shopName, STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT),
        html: buildStaffRegistrationOwnerDigestEmailHtml({
          managerName: recipient.name,
          dashboardUrl: data.dashboardUrl,
        }),
        context: STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT,
        suppressDelivery,
      }),
    });
  }
}

/**
 * 参加申請の確認コードを、入力画面で待っている本人へすぐに送る。
 * 宛先はまだスタッフではなく、届かなければ本人が画面から再送するため、通知Outboxと要対応Inboxは通さない。
 * 確認コードはDBへ保存せず、この呼び出しの引数だけで受け渡す。
 */
export const sendVerificationCodeEmail = internalAction({
  args: {
    to: v.string(),
    shopName: v.string(),
    code: v.string(),
    idempotencyKey: v.string(),
  },
  returns: v.object({ status: v.union(v.literal("sent"), v.literal("delivery_failed")) }),
  handler: async (_ctx, args) => {
    const suppressDelivery = getNotificationDeliveryBehavior() === "dry-run";
    try {
      await sendResendEmail(
        getResendClient({ suppressDelivery }),
        {
          from: formatResendFrom(args.shopName, RESEND_FROM_EMAIL),
          to: args.to,
          subject: formatResendSubject(args.shopName, buildStaffRegistrationVerificationCodeSubject(args.code)),
          html: buildStaffRegistrationVerificationCodeEmailHtml({
            shopName: args.shopName,
            code: args.code,
            expiresInMinutes: STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS / MINUTE_MS,
          }),
        },
        STAFF_REGISTRATION_VERIFICATION_CODE_CONTEXT,
        { idempotencyKey: args.idempotencyKey },
      );
    } catch {
      return { status: "delivery_failed" as const };
    }
    return { status: "sent" as const };
  },
});
