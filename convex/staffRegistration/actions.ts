"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { selectChannel } from "../_lib/notification";
import { STAFF_REGISTRATION_DAILY_DIGEST_PENDING_PAGE_SIZE } from "../constants";
import {
  buildStaffRegistrationOwnerDigestEmailHtml,
  buildStaffRegistrationOwnerDigestLineText,
  STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT,
} from "../notification/templates";
import { emailPayload, enqueueEmail, enqueueLine, linePayload } from "../notificationOutbox/enqueue";

type PendingRequestShopIdsPage = {
  page: Id<"shops">[];
  continueCursor: string;
  isDone: boolean;
};

export const sendOwnerDailyDigest = internalAction({
  args: {},
  handler: async (ctx) => {
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

  const [quota, suppressDelivery] = await Promise.all([
    ctx.runQuery(internal.line.queries.getQuotaStatusInternal, {}),
    ctx.runQuery(internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop, {
      shopId: data.shopId,
    }),
  ]);

  for (const recipient of data.recipients) {
    const channel = selectChannel({ lineUserId: recipient.lineUserId, lineFollowing: recipient.lineFollowing }, quota);

    if (channel === "line" && recipient.lineUserId) {
      await enqueueLine(ctx, {
        shopId: data.shopId,
        dedupeKey: `line:staffRegistrationDailyDigest:${data.shopId}:${recipient.userId}`,
        payload: linePayload({
          toUserId: recipient.lineUserId,
          text: buildStaffRegistrationOwnerDigestLineText({
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
              context: "staffRegistration.sendOwnerDailyDigest",
              suppressDelivery,
            }),
          },
        }),
      });
      continue;
    }

    await enqueueEmail(ctx, {
      shopId: data.shopId,
      dedupeKey: `email:staffRegistrationDailyDigest:${data.shopId}:${recipient.userId}`,
      payload: emailPayload({
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: recipient.email,
        subject: formatResendSubject(data.shopName, STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT),
        html: buildStaffRegistrationOwnerDigestEmailHtml({
          managerName: recipient.name,
          dashboardUrl: data.dashboardUrl,
        }),
        context: "staffRegistration.sendOwnerDailyDigest",
        suppressDelivery,
      }),
    });
  }
}
